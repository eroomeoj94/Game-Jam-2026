import {
  AdditiveBlending,
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
} from 'three';
import {
  ARENA,
  CAP,
  DANCE,
  FIRECRACKER,
  GUST,
  LAMPS,
  WEAPONS,
} from '../config';
import type { WeaponId } from '../config';
import { horizontal, launchVelocity } from '../game/gadgets';
import type { Aim } from '../game/gadgets';
import type { WorldEvent, WorldView } from '../game/world';

export type AimPreview = {
  weapon: WeaponId;
  aim: Aim;
  /** Charge from 0 to 1. */
  power: number;
  /** For Zap Switch: the lamp that would flip. */
  lamp?: number;
};

const ZAP_VIOLET = 0xa77bff;
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
      blending: additive ? AdditiveBlending : undefined,
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
  const toVector = ({ x, y, z }: { x: number; y: number; z: number }) =>
    new Vector3(x, y, z);

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

  // Smoke trails follow moths while they are flying from a zap.
  let smokeTimer = 0;

  return {
    setAim(next: AimPreview | undefined) {
      preview = next;
    },
    play(events: WorldEvent[], view: WorldView) {
      for (const event of events) {
        if (event.type === 'gust') {
          const origin = toVector(event.origin);
          for (let i = 0; i < 7; i++) {
            const spread = (i / 6 - 0.5) * GUST.halfAngle * 1.6;
            const cos = Math.cos(spread);
            const sin = Math.sin(spread);
            const dx = event.direction.x * cos - event.direction.z * sin;
            const dz = event.direction.x * sin + event.direction.z * cos;
            const speed = GUST.range / 0.45;
            puff(origin.clone(), 0xf4ead6, 0.45, (effect, t, delta) => {
              const mesh = effect.object as Mesh;
              mesh.position.x += dx * speed * delta;
              mesh.position.z += dz * speed * delta;
              mesh.position.y += 0.4 * delta;
              mesh.scale.setScalar(0.12 + t * 0.5);
              fade(mesh, 0.45, t);
            });
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
        } else if (event.type === 'bonk') {
          const at = toVector(event.position);
          flash(at, 0xfff0b0, 30);
          popup('BONK!', at.setY(at.y + 1.2), '#ffd36b');
        } else if (event.type === 'squeak') {
          const at = toVector(event.position);
          popup('SQUEAK!', at.setY(at.y + 1.2), '#f3b6c0');
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
          if (projectile.kind === 'cap') {
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
