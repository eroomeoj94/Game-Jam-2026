import {
  AdditiveBlending,
  CircleGeometry,
  TorusGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Camera,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  NormalBlending,
} from 'three';
import {
  ARENA,
  CAP,
  DANCE,
  FIRECRACKER,
  GUST,
  HAZARD,
  LAMPS,
  WEAPONS,
} from '../config';
import type { WeaponId } from '../config';
import { horizontal, launchVelocity } from '../game/gadgets';
import type { Aim } from '../game/gadgets';
import type { WorldEvent, WorldView } from '../game/world';
import { loadProp } from './weaponModels';

export type AimPreview = {
  weapon: WeaponId;
  aim: Aim;
  /** Charge from 0 to 1. */
  power: number;
  /** For Zap Switch: the lamp that would flip. */
  lamp?: number;
  /** For Mind Control: where the hand will land, and whose hand. */
  spot?: { x: number; z: number };
  giant?: number;
};

const ZAP_VIOLET = 0xa77bff;
const MIND_PURPLE = 0xb48cff;
const GRAVITY = 9.82;
const TEAM_COLOURS = ['#ffcf73', '#7fe3d8'];

/**
 * Weapon visuals: the aiming preview, projectile models, and short-lived
 * effects (gust puffs, blasts, zap flashes, smoke and pop-ups). Purely
 * presentational: nothing here changes the simulation.
 */
export function createWeaponEffects(
  scene: Scene,
  camera: Camera,
  host: HTMLElement,
) {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  // --- Aim preview -------------------------------------------------------
  const previewMaterial = keep(
    new MeshBasicMaterial({
      color: 0xfff1cf,
      transparent: true,
      opacity: 0.22,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  // A flat wedge on the desk showing the gust's reach; rebuilt when tuned.
  const wedge = () =>
    new RingGeometry(
      ARENA.mothRadius,
      GUST.range,
      32,
      1,
      Math.PI / 2 - GUST.halfAngle,
      GUST.halfAngle * 2,
    );
  let coneShape = `${GUST.range}:${GUST.halfAngle}`;
  const cone = new Mesh(wedge(), previewMaterial);
  cone.rotation.x = -Math.PI / 2;
  const coneHolder = new Group();
  coneHolder.add(cone);
  scene.add(coneHolder);
  // A short dotted arc: the initial direction, not a promised landing spot.
  const dotGeometry = keep(new SphereGeometry(0.06, 8, 6));
  const dotMaterial = keep(
    new MeshBasicMaterial({ color: 0xfff1cf, transparent: true, opacity: 0.8 }),
  );
  const dots = Array.from({ length: 14 }, () => {
    const dot = new Mesh(dotGeometry, dotMaterial);
    scene.add(dot);
    return dot;
  });
  // Ring around the light of the lamp a Zap Switch would flip.
  const targetRing = new Mesh(
    keep(new RingGeometry(0.93, 1, 96)),
    keep(
      new MeshBasicMaterial({
        color: ZAP_VIOLET,
        transparent: true,
        opacity: 0.9,
        side: DoubleSide,
        depthWrite: false,
      }),
    ),
  );
  targetRing.rotation.x = -Math.PI / 2;
  scene.add(targetRing);
  // Mind Control: the patch of desk the commanded hand will hit.
  const mindMark = new Group();
  const mindDisc = new Mesh(
    keep(new CircleGeometry(HAZARD.radius, 48)),
    keep(
      new MeshBasicMaterial({
        color: MIND_PURPLE,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    ),
  );
  const mindEdge = new Mesh(
    keep(new RingGeometry(HAZARD.radius - 0.22, HAZARD.radius, 64)),
    keep(
      new MeshBasicMaterial({
        color: 0xe9dcff,
        transparent: true,
        opacity: 0.95,
        side: DoubleSide,
        depthWrite: false,
      }),
    ),
  );
  mindDisc.rotation.x = mindEdge.rotation.x = -Math.PI / 2;
  mindEdge.position.y = 0.01;
  mindMark.add(mindDisc, mindEdge);
  mindMark.visible = false;
  scene.add(mindMark);
  const hoopGeometry = keep(new TorusGeometry(1, 0.07, 8, 40));
  let preview: AimPreview | undefined;

  // --- Projectiles -------------------------------------------------------
  const capGeometry = keep(
    new CylinderGeometry(CAP.radius * 1.4, CAP.radius * 1.4, 0.1, 20),
  );
  const capMaterial = keep(
    new MeshStandardMaterial({
      color: 0xc23b2e,
      metalness: 0.7,
      roughness: 0.35,
    }),
  );
  const crackerGeometry = keep(
    new CylinderGeometry(FIRECRACKER.radius, FIRECRACKER.radius, 0.5, 14),
  );
  const crackerMaterial = keep(
    new MeshStandardMaterial({ color: 0xd8312a, roughness: 0.8 }),
  );
  const sparkMaterial = keep(
    new MeshBasicMaterial({ color: 0xffd36b, blending: AdditiveBlending }),
  );
  const projectileMeshes = new Map<number, Group>();
  // The modelled cap and firecracker replace the plain shapes once loaded.
  const props: { cap?: Group; firecracker?: Group } = {};
  void loadProp('projectile-cap', CAP.radius * 3.4).then((prop) => {
    props.cap = prop;
  });
  void loadProp('projectile-firecracker', 0.62).then((prop) => {
    props.firecracker = prop;
  });
  let trailTimer = 0;

  // --- Short-lived effects ---------------------------------------------
  type Effect = {
    object: Mesh;
    age: number;
    life: number;
    update(effect: Effect, t: number, delta: number): void;
  };
  const effects: Effect[] = [];
  const puffGeometry = keep(new SphereGeometry(1, 12, 8));
  function puff(
    position: Vector3,
    colour: number,
    life: number,
    update: Effect['update'],
    opacity = 0.6,
    additive = false,
  ) {
    const material = new MeshBasicMaterial({
      color: colour,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    const mesh = new Mesh(puffGeometry, material);
    mesh.position.copy(position);
    scene.add(mesh);
    effects.push({ object: mesh, age: 0, life, update });
    return mesh;
  }
  // A fixed pool of flash lights: adding lights at runtime would make
  // three.js recompile every material and stutter on each explosion.
  const flashes = Array.from({ length: 3 }, () => {
    const light = new PointLight(0xffffff, 0, 12, 2);
    scene.add(light);
    return { light, age: 1, life: 0.35, peak: 0 };
  });
  let nextFlash = 0;
  function flash(position: Vector3, colour: number, intensity: number) {
    const slot = flashes[nextFlash++ % flashes.length]!;
    slot.light.position.copy(position);
    slot.light.color.setHex(colour);
    slot.age = 0;
    slot.peak = intensity;
  }
  const fade = (mesh: Mesh, from: number, t: number) => {
    (mesh.material as MeshBasicMaterial).opacity = from * (1 - t);
  };
  /** Add a ready-made mesh as a short-lived effect, with its own material. */
  function spawn(mesh: Mesh, life: number, update: Effect['update']) {
    scene.add(mesh);
    effects.push({ object: mesh, age: 0, life, update });
    return mesh;
  }
  // A ribbon of wind: a flat strip that runs straight, then curls over.
  const ribbonGeometry = keep(
    (() => {
      const steps = 28;
      const positions: number[] = [];
      const index: number[] = [];
      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        let x = 0;
        let z = t;
        if (t > 0.6) {
          const curl = (t - 0.6) / 0.4;
          const radius = 0.2 * (1 - curl * 0.55);
          const angle = curl * Math.PI * 1.75;
          x = 0.2 - radius * Math.cos(angle);
          z = 0.6 + radius * Math.sin(angle);
        }
        // Thin at both ends, widest in the middle.
        const half = 0.035 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05));
        positions.push(x, half, z, x, -half, z);
        if (step < steps) {
          const a = step * 2;
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(positions, 3),
      );
      geometry.setIndex(index);
      return geometry;
    })(),
  );
  const boltGeometry = keep(new CylinderGeometry(1, 1, 1, 5, 1, true));
  const UP = new Vector3(0, 1, 0);
  /** One jagged stroke of lightning between two points, gone in a blink. */
  function bolt(from: Vector3, to: Vector3, width: number, colour: number) {
    const pieces = 9;
    const along = to.clone().sub(from);
    const side = new Vector3().crossVectors(along, UP).normalize();
    const lift = new Vector3().crossVectors(side, along).normalize();
    const reach = along.length() * 0.09;
    let last = from.clone();
    for (let piece = 1; piece <= pieces; piece++) {
      const t = piece / pieces;
      const sway = Math.sin(Math.PI * t) * reach;
      const next = from
        .clone()
        .addScaledVector(along, t)
        .addScaledVector(side, (Math.random() - 0.5) * 2 * sway)
        .addScaledVector(lift, (Math.random() - 0.5) * 2 * sway);
      if (piece === pieces) next.copy(to);
      const span = next.clone().sub(last);
      const mesh = new Mesh(
        boltGeometry,
        new MeshBasicMaterial({
          color: colour,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          blending: AdditiveBlending,
        }),
      );
      mesh.position.copy(last).addScaledVector(span, 0.5);
      mesh.scale.set(width, span.length(), width);
      mesh.quaternion.setFromUnitVectors(UP, span.clone().normalize());
      spawn(mesh, 0.14, (effect, life) => fade(effect.object, 1, life * life));
      last = next;
    }
  }
  /** Lightning from a lantern to a lamp: three quick strikes and sparks. */
  function lightning(from: Vector3, to: Vector3) {
    flash(from, 0x9ff3ff, 45);
    for (let strike = 0; strike < 3; strike++)
      window.setTimeout(() => {
        bolt(from, to, 0.022, 0xeaffff);
        bolt(from, to, 0.06, 0x53dfe8);
      }, strike * 90);
    for (let spark = 0; spark < 14; spark++) {
      const angle = Math.random() * Math.PI * 2;
      const rise = (Math.random() - 0.3) * 5;
      const speed = 3 + Math.random() * 4;
      puff(
        to.clone(),
        spark % 2 ? 0xeaffff : 0x53dfe8,
        0.45,
        (effect, t, delta) => {
          const mesh = effect.object;
          mesh.position.x += Math.cos(angle) * speed * delta;
          mesh.position.z += Math.sin(angle) * speed * delta;
          mesh.position.y += (rise - t * 9) * delta;
          mesh.scale.setScalar(0.09 * (1 - t) + 0.02);
          fade(mesh, 1, t);
        },
        1,
        true,
      );
    }
  }
  const toVector = ({ x, y, z }: { x: number; y: number; z: number }) =>
    new Vector3(x, y, z);

  let pinnedNotes = 0;

  function popup(
    text: string,
    position: Vector3,
    colour: string,
    variant?: 'big',
  ) {
    const point = position.clone().project(camera);
    if (point.z > 1) return;
    const element = document.createElement('div');
    element.className = variant ? `popup popup-${variant}` : 'popup';
    element.textContent = text;
    element.style.color = colour;
    element.style.left = `${((point.x + 1) / 2) * 100}%`;
    element.style.top = `${((1 - point.y) / 2) * 100}%`;
    host.appendChild(element);
    window.setTimeout(() => element.remove(), 1500);
  }

  /** A lamp just paid out: a glow and a "+1" in the team's colour. */
  function showScore(position: Vector3, team: number, points = 1) {
    flash(position, team === 0 ? 0xffcf73 : 0x7fe3d8, 60);
    popup(`+${points}`, position, TEAM_COLOURS[team] ?? '#ffffff', 'big');
  }

  // Smoke trails follow moths while they are flying from a zap.
  let smokeTimer = 0;

  return {
    setAim(next: AimPreview | undefined) {
      preview = next;
    },
    showScore,
    /** A short note floating up from a spot on the desk, in a team's colour. */
    showNote(text: string, position: Vector3, team: number) {
      // A note is news the player must not miss: if its spot is off screen
      // or behind the camera, pin it to the nearest edge instead.
      const point = position.clone().project(camera);
      const behind = point.z > 1;
      const pinned = behind || Math.abs(point.x) > 0.5 || point.y < -0.5;
      const x = Math.max(-0.5, Math.min(0.5, behind ? -point.x : point.x));
      // Notes pinned at the same moment stack rather than overprint.
      const row = pinned ? pinnedNotes++ : 0;
      if (pinned) window.setTimeout(() => pinnedNotes--, 1500);
      const y =
        Math.max(-0.5, Math.min(0.6, behind ? -0.5 : point.y)) + row * 0.12;
      popup(
        text,
        new Vector3(x, y, Math.min(point.z, 0.99)).unproject(camera),
        TEAM_COLOURS[team] ?? '#ffffff',
      );
    },
    play(events: WorldEvent[], view: WorldView) {
      for (const event of events) {
        if (event.type === 'gust') {
          const origin = toVector(event.origin);
          // Curling ribbons of wind fan out across the cone, like the
          // swirls on the fan's icon, with a few soft puffs behind them.
          const ribbons = 9;
          for (let i = 0; i < ribbons; i++) {
            const spread = (i / (ribbons - 1) - 0.5) * GUST.halfAngle * 1.7;
            const cos = Math.cos(spread);
            const sin = Math.sin(spread);
            const dx = event.direction.x * cos - event.direction.z * sin;
            const dz = event.direction.x * sin + event.direction.z * cos;
            const speed = (GUST.range / 0.5) * (0.8 + Math.random() * 0.35);
            const mesh = new Mesh(
              ribbonGeometry,
              new MeshBasicMaterial({
                color: i % 2 ? 0xfff3d6 : 0xbfe9f2,
                transparent: true,
                opacity: 0.9,
                side: DoubleSide,
                depthWrite: false,
              }),
            );
            mesh.position
              .copy(origin)
              .add(new Vector3(dx * 0.5, 0.15 + (i % 3) * 0.18, dz * 0.5));
            mesh.rotation.order = 'YXZ';
            mesh.rotation.y = Math.atan2(dx, dz);
            // Half of them curl the other way.
            const hand = i % 2 ? 1 : -1;
            const roll = (Math.random() - 0.5) * 2;
            spawn(mesh, 0.55, (effect, t, delta) => {
              const ribbon = effect.object;
              ribbon.position.x += dx * speed * (1 - t * 0.6) * delta;
              ribbon.position.z += dz * speed * (1 - t * 0.6) * delta;
              ribbon.position.y += 0.5 * delta;
              const length = 0.5 + t * 1.5;
              ribbon.scale.set(hand * (0.8 + t), 1.2 + t, length);
              ribbon.rotation.z = roll + t * 2.5 * hand;
              fade(ribbon, 0.9, t * t);
            });
            if (i % 3) continue;
            puff(
              origin.clone(),
              0xf4ead6,
              0.4,
              (effect, t, delta) => {
                const cloud = effect.object;
                cloud.position.x += dx * speed * 0.8 * delta;
                cloud.position.z += dz * speed * 0.8 * delta;
                cloud.scale.setScalar(0.12 + t * 0.45);
                fade(cloud, 0.3, t);
              },
              0.3,
            );
          }
        } else if (event.type === 'bosh') {
          const at = toVector(event.position);
          const hit = event.moth !== undefined;
          if (hit) {
            flash(at, 0xfff2c4, 110);
            // A shockwave ball and a big starburst of streaks round the fist.
            puff(
              at.clone(),
              0xfff0b0,
              0.35,
              (effect, t) => {
                const mesh = effect.object as Mesh;
                mesh.scale.setScalar(0.3 + t * 3.2);
                fade(mesh, 0.8, t);
              },
              0.8,
              true,
            );
            for (let i = 0; i < 20; i++) {
              const angle = (i / 20) * Math.PI * 2;
              const speed = i % 2 ? 11 : 7;
              puff(
                at.clone(),
                i % 2 ? 0xfff4d6 : 0xffb347,
                0.4,
                (effect, t, delta) => {
                  const mesh = effect.object as Mesh;
                  mesh.position.x += Math.cos(angle) * speed * delta;
                  mesh.position.y += Math.sin(angle) * speed * delta;
                  mesh.scale.setScalar(0.22 * (1 - t) + 0.03);
                  fade(mesh, 0.95, t);
                },
                0.95,
                true,
              );
            }
          }
          popup(
            hit ? 'BOSH!!' : 'bosh?',
            at.clone().setY(at.y + 1.1),
            hit ? '#ffe066' : '#d9d2c3',
            hit ? 'big' : undefined,
          );
        } else if (event.type === 'hit') {
          const at = toVector(event.position);
          puff(
            at,
            0xffffff,
            0.25,
            (effect, t) => {
              const mesh = effect.object as Mesh;
              mesh.scale.setScalar(0.3 + t * 0.6);
              fade(mesh, 0.7, t);
            },
            0.7,
            true,
          );
        } else if (event.type === 'explode') {
          const at = toVector(event.position);
          flash(at, 0xffb347, 60);
          puff(
            at,
            0xfff0b0,
            0.4,
            (effect, t) => {
              const mesh = effect.object as Mesh;
              mesh.scale.setScalar(0.4 + t * FIRECRACKER.blastRadius);
              fade(mesh, 0.85, t);
            },
            0.85,
            true,
          );
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            puff(
              at.clone(),
              0x4a4440,
              1.1,
              (effect, t, delta) => {
                const mesh = effect.object as Mesh;
                mesh.position.x += Math.cos(angle) * 1.6 * delta;
                mesh.position.z += Math.sin(angle) * 1.6 * delta;
                mesh.position.y += 1.2 * delta;
                mesh.scale.setScalar(0.25 + t * 0.7);
                fade(mesh, 0.55, t);
              },
              0.55,
            );
          }
          popup('BANG!', at.clone().setY(at.y + 1), '#ffd36b');
        } else if (event.type === 'zap') {
          const at = toVector(event.position);
          flash(at, ZAP_VIOLET, 90);
          puff(
            at,
            ZAP_VIOLET,
            0.3,
            (effect, t) => {
              const mesh = effect.object as Mesh;
              mesh.scale.setScalar(0.6 + t * 2.2);
              fade(mesh, 0.9, t);
            },
            0.9,
            true,
          );
          popup(
            'ZAPPED! −1',
            at.clone().setY(at.y + 1.2),
            TEAM_COLOURS[event.team] ?? '#ffffff',
          );
        } else if (event.type === 'mind') {
          // Hoops of purple thought spiral from the gun to the giant's head,
          // which lights up as the spell takes hold.
          const from = toVector(event.origin).setY(event.origin.y + 0.2);
          const giant = view.people[event.person];
          const head = giant
            ? new Vector3(giant.x, 26, giant.z)
            : toVector(event.position).setY(20);
          const path = head.clone().sub(from);
          flash(from, MIND_PURPLE, 70);
          for (let hoop = 0; hoop < 12; hoop++) {
            const start = hoop * 0.05;
            const mesh = new Mesh(
              hoopGeometry,
              new MeshBasicMaterial({
                color: hoop % 2 ? 0xe9dcff : MIND_PURPLE,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                blending: AdditiveBlending,
              }),
            );
            mesh.position.copy(from);
            mesh.lookAt(head);
            spawn(mesh, 0.9 + start, (effect, t) => {
              const life = Math.max(0, (t * (0.9 + start) - start) / 0.9);
              const hoopMesh = effect.object;
              hoopMesh.position.copy(from).addScaledVector(path, life);
              hoopMesh.scale.setScalar(0.25 + life * 3.2);
              hoopMesh.rotation.z = life * 6 + hoop;
              fade(hoopMesh, life > 0 ? 0.95 : 0, life * life);
            });
          }
          window.setTimeout(() => flash(head, MIND_PURPLE, 120), 600);
          popup(
            'MIND CONTROL!',
            from.clone().setY(from.y + 1.4),
            '#c9b0ff',
            'big',
          );
        } else if (event.type === 'launch') {
          const at = toVector(event.position);
          if (event.kind === 'firecracker') {
            // Muzzle flash and a cough of smoke from the cannon.
            flash(at, 0xffb347, 40);
            puff(
              at.clone(),
              0xffe9a8,
              0.18,
              (effect, t) => {
                effect.object.scale.setScalar(0.15 + t * 0.6);
                fade(effect.object, 0.95, t);
              },
              0.95,
              true,
            );
            for (let i = 0; i < 6; i++) {
              const angle = (i / 6) * Math.PI * 2;
              puff(
                at.clone(),
                0x5a524c,
                0.7,
                (effect, t, delta) => {
                  const smoke = effect.object;
                  smoke.position.x += Math.cos(angle) * 0.9 * (1 - t) * delta;
                  smoke.position.z += Math.sin(angle) * 0.9 * (1 - t) * delta;
                  smoke.position.y += 0.7 * delta;
                  smoke.scale.setScalar(0.14 + t * 0.4);
                  fade(smoke, 0.5, t);
                },
                0.5,
              );
            }
          } else {
            // The band snaps: a quick ring and a glint.
            puff(
              at.clone(),
              0xfff1cf,
              0.2,
              (effect, t) => {
                effect.object.scale.set(0.1 + t * 0.7, 0.1 + t * 0.7, 0.04);
                fade(effect.object, 0.8, t);
              },
              0.8,
              true,
            );
          }
        } else if (event.type === 'heard') {
          const at = toVector(event.position);
          popup('OI!', at.setY(at.y + 4), '#ff8a6b');
        } else if (event.type === 'smack') {
          const at = toVector(event.position);
          // Dust squeezed out from under the palm.
          for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            puff(
              at
                .clone()
                .add(
                  new Vector3(
                    Math.cos(angle) * HAZARD.radius * 0.8,
                    0.3,
                    Math.sin(angle) * HAZARD.radius * 0.8,
                  ),
                ),
              0xd8cbb4,
              0.7,
              (effect, t, delta) => {
                const mesh = effect.object as Mesh;
                mesh.position.x += Math.cos(angle) * 5 * (1 - t) * delta;
                mesh.position.z += Math.sin(angle) * 5 * (1 - t) * delta;
                mesh.position.y += 0.8 * delta;
                mesh.scale.setScalar(0.5 + t * 1.4);
                fade(mesh, 0.5, t);
              },
              0.5,
            );
          }
          popup(
            event.moths ? 'SPLAT!' : 'SMACK!',
            at.setY(at.y + 3),
            '#ffd36b',
          );
        } else if (event.type === 'dance') {
          const at = toVector(event.position);
          popup(
            `${DANCE.names[event.variant - 1] ?? 'Dance'}!`,
            at.setY(at.y + 1.3),
            '#ffe2a8',
          );
        } else if (event.type === 'lamp') {
          const lamp = view.lamps[event.lamp];
          if (!lamp) continue;
          const at = toVector(lamp);
          flash(at, event.zapper ? ZAP_VIOLET : 0xffc987, 50);
          // The switch is thrown from the lantern in the active moth's hand.
          const zapper = view.moths[view.selectedMoth];
          if (event.zapper && zapper)
            lightning(toVector(zapper).setY(zapper.y + 0.15), at.clone());
          popup(
            event.zapper ? 'BUG ZAPPER!' : 'Lamp restored',
            at.clone().setY(at.y + 1),
            event.zapper ? '#c9b2ff' : '#ffe2a8',
          );
        }
      }
    },
    update(view: WorldView, delta: number) {
      // Aim preview.
      const active = view.moths[view.selectedMoth];
      const show = !!preview && !!active && !active.respawning;
      const flat = preview ? horizontal(preview.aim) : undefined;
      coneHolder.visible = show && preview?.weapon === 'gust' && !!flat;
      if (
        coneHolder.visible &&
        coneShape !== `${GUST.range}:${GUST.halfAngle}`
      ) {
        coneShape = `${GUST.range}:${GUST.halfAngle}`;
        cone.geometry.dispose();
        cone.geometry = wedge();
      }
      if (coneHolder.visible && active && flat) {
        coneHolder.position.set(
          active.x,
          active.y - ARENA.mothRadius + 0.03,
          active.z,
        );
        coneHolder.rotation.y = Math.atan2(flat.x, flat.z);
      }
      const weapon = WEAPONS.find((item) => item.id === preview?.weapon);
      const arc =
        show &&
        !!weapon &&
        (preview?.weapon === 'cap' || preview?.weapon === 'firecracker');
      if (arc && active && preview && flat) {
        const settings = preview.weapon === 'cap' ? CAP : FIRECRACKER;
        const velocity = launchVelocity(
          preview.aim,
          preview.power,
          settings.minSpeed,
          settings.maxSpeed,
        );
        const startX = active.x + flat.x * (ARENA.mothRadius + 0.3);
        const startZ = active.z + flat.z * (ARENA.mothRadius + 0.3);
        dots.forEach((dot, index) => {
          const t = (index + 1) * 0.045;
          dot.visible = true;
          dot.position.set(
            startX + velocity.x * t,
            active.y + 0.25 + velocity.y * t - 0.5 * GRAVITY * t * t,
            startZ + velocity.z * t,
          );
        });
      } else dots.forEach((dot) => (dot.visible = false));
      const target =
        show && preview?.weapon === 'zap' && preview.lamp !== undefined
          ? view.lamps[preview.lamp]
          : undefined;
      // Mind Control's target pulses on the desk while it is aimed.
      const spot =
        show && preview?.weapon === 'mind' ? preview.spot : undefined;
      mindMark.visible = !!spot;
      if (spot) {
        mindMark.position.set(spot.x, 0.05, spot.z);
        mindEdge.scale.setScalar(1 + Math.sin(performance.now() / 110) * 0.04);
      }
      targetRing.visible = !!target;
      if (target) {
        const radius = Math.sqrt(
          Math.max(0.01, LAMPS.haloRadius ** 2 - target.y ** 2),
        );
        targetRing.scale.setScalar(
          radius * (1.02 + Math.sin(performance.now() / 120) * 0.02),
        );
        targetRing.position.set(target.x, 0.03, target.z);
      }

      // Projectiles.
      const live = new Set<number>();
      for (const projectile of view.projectiles) {
        live.add(projectile.id);
        let mesh = projectileMeshes.get(projectile.id);
        if (!mesh) {
          mesh = new Group();
          const prop = props[projectile.kind];
          if (prop) {
            mesh.add(prop.clone());
            if (projectile.kind === 'firecracker') {
              const spark = new Mesh(dotGeometry, sparkMaterial);
              // The modelled cracker's fuse is at its -x end.
              spark.position.x = -0.33;
              spark.name = 'spark';
              mesh.add(spark);
            }
          } else if (projectile.kind === 'cap') {
            const cap = new Mesh(capGeometry, capMaterial);
            cap.castShadow = true;
            mesh.add(cap);
          } else {
            const cracker = new Mesh(crackerGeometry, crackerMaterial);
            cracker.rotation.z = Math.PI / 2;
            cracker.castShadow = true;
            mesh.add(cracker);
            const spark = new Mesh(dotGeometry, sparkMaterial);
            spark.position.x = 0.3;
            spark.name = 'spark';
            mesh.add(spark);
          }
          scene.add(mesh);
          projectileMeshes.set(projectile.id, mesh);
        }
        mesh.position.set(projectile.x, projectile.y, projectile.z);
        mesh.rotation.y += delta * (projectile.kind === 'cap' ? 18 : 4);
        const spark = mesh.getObjectByName('spark');
        if (spark)
          spark.scale.setScalar(
            0.8 + Math.random() * 1.4 + (1 - projectile.fuse) * 1.5,
          );
      }
      // Trails: glints behind a cap, smoke and sparks behind a firecracker.
      trailTimer -= delta;
      if (trailTimer <= 0) {
        trailTimer = 0.035;
        for (const projectile of view.projectiles) {
          const at = toVector(projectile);
          if (projectile.kind === 'cap')
            puff(
              at,
              0xffe08a,
              0.22,
              (effect, t) => {
                effect.object.scale.setScalar(0.1 * (1 - t) + 0.01);
                fade(effect.object, 0.8, t);
              },
              0.8,
              true,
            );
          else {
            puff(
              at.clone(),
              0x6a625c,
              0.6,
              (effect, t, step) => {
                effect.object.position.y += 0.4 * step;
                effect.object.scale.setScalar(0.08 + t * 0.26);
                fade(effect.object, 0.4, t);
              },
              0.4,
            );
            const drift = new Vector3(
              Math.random() - 0.5,
              Math.random() * 0.5,
              Math.random() - 0.5,
            );
            puff(
              at,
              0xffc24a,
              0.3,
              (effect, t, step) => {
                effect.object.position.addScaledVector(drift, 2.5 * step);
                effect.object.position.y -= t * 3 * step;
                effect.object.scale.setScalar(0.05 * (1 - t) + 0.01);
                fade(effect.object, 1, t);
              },
              1,
              true,
            );
          }
        }
      }
      for (const [id, mesh] of projectileMeshes)
        if (!live.has(id)) {
          scene.remove(mesh);
          projectileMeshes.delete(id);
        }

      // Smoke behind zapped moths.
      smokeTimer -= delta;
      if (smokeTimer <= 0) {
        smokeTimer = 0.05;
        for (const moth of view.moths)
          if (moth.zapped)
            puff(
              toVector(moth),
              0x3a3434,
              0.8,
              (effect, t, step) => {
                const mesh = effect.object as Mesh;
                mesh.position.y += 0.5 * step;
                mesh.scale.setScalar(0.12 + t * 0.35);
                fade(mesh, 0.5, t);
              },
              0.5,
            );
      }

      for (const slot of flashes) {
        slot.age += delta;
        slot.light.intensity =
          slot.peak * Math.max(0, 1 - slot.age / slot.life);
      }
      for (const effect of [...effects]) {
        effect.age += delta;
        const t = Math.min(1, effect.age / effect.life);
        effect.update(effect, t, delta);
        if (t < 1) continue;
        scene.remove(effect.object);
        if (effect.object instanceof Mesh)
          (effect.object.material as MeshBasicMaterial).dispose();
        effects.splice(effects.indexOf(effect), 1);
      }
    },
    destroy() {
      for (const effect of effects) {
        scene.remove(effect.object);
        if (effect.object instanceof Mesh)
          (effect.object.material as MeshBasicMaterial).dispose();
      }
      effects.length = 0;
      flashes.forEach(({ light }) => {
        scene.remove(light);
        light.dispose();
      });
      host.querySelectorAll('.popup').forEach((element) => element.remove());
      disposables.forEach((item) => item.dispose());
      cone.geometry.dispose();
    },
  };
}
