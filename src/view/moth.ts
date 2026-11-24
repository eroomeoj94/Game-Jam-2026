import {
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { FUR, MOTH_LOOK } from '../config';
import type { MothView } from '../game/world';
import { createFurShells } from './fur';
import { loadMothModel } from './mothModel';
import { loadWeaponModel, WEAPON_GRIP } from './weaponModels';
import type { WeaponId } from '../config';
import type { createMaterials } from './materials';

/** The right hand, measured from the right shoulder; the left mirrors it. */
const HAND = { x: 0.07, y: -0.34, z: 0.02 };

export function createMoth(
  materials: ReturnType<typeof createMaterials>,
  color: number,
  team: number,
  /** Offsets idle animation so teammates do not move in lockstep. */
  phase = team,
) {
  const root = new Group();
  const puppet = new Group();
  root.add(puppet);
  const cream = materials.felt(0xf0dcb8);
  const wingMaterial = materials.felt(color);
  const dark = new MeshStandardMaterial({ color: 0x211b1c, roughness: 0.22 });
  const stitches = new MeshStandardMaterial({ color: 0xe6cc9b, roughness: 1 });
  const gloveMaterial = materials.felt(team === 0 ? 0x963e32 : 0x624871);
  // Felt that glows a little in its own colour, so moths read in the dark.
  const lit = [cream, wingMaterial, gloveMaterial];
  for (const material of lit) {
    material.emissive.copy(material.color);
    material.emissiveMap = material.map;
    material.emissiveIntensity = MOTH_LOOK.glow;
  }
  const sphere = new SphereGeometry(1, 24, 16);
  function ball(
    parent: Group,
    material: MeshStandardMaterial,
    size: [number, number, number],
    position: [number, number, number],
  ) {
    const mesh = new Mesh(sphere, material);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const wings: Group[] = [];
  for (const side of [-1, 1]) {
    const wing = new Group();
    wing.position.set(side * 0.18, 0.1, -0.12);
    wing.rotation.z = side * -0.3;
    ball(wing, wingMaterial, [0.45, 0.57, 0.1], [side * 0.35, 0.1, 0]);
    ball(wing, wingMaterial, [0.33, 0.31, 0.11], [side * 0.28, -0.25, 0.025]);
    ball(
      wing,
      gloveMaterial,
      [0.16, team === 0 ? 0.19 : 0.08, 0.025],
      [side * 0.44, 0.18, 0.1],
    );
    ball(wing, cream, [0.065, 0.075, 0.025], [side * 0.44, 0.18, 0.125]);
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2;
      const stitch = ball(
        wing,
        stitches,
        [0.012, 0.028, 0.012],
        [
          side * (0.35 + Math.cos(angle) * 0.36),
          0.1 + Math.sin(angle) * 0.48,
          0.07,
        ],
      );
      stitch.rotation.z = -side * angle;
    }
    puppet.add(wing);
    wings.push(wing);
  }
  const body = ball(puppet, cream, [0.29, 0.43, 0.25], [0, -0.02, 0]);
  const head = ball(puppet, cream, [0.34, 0.29, 0.28], [0, 0.3, 0.04]);
  for (const side of [-1, 1]) {
    ball(puppet, cream, [0.13, 0.08, 0.2], [side * 0.15, -0.42, 0.1]);
    ball(puppet, dark, [0.085, 0.1, 0.065], [side * 0.14, 0.33, 0.29]);
    ball(
      puppet,
      stitches,
      [0.023, 0.027, 0.013],
      [side * 0.14 - 0.02, 0.36, 0.35],
    );
    const brow = ball(
      puppet,
      gloveMaterial,
      [0.13, 0.035, 0.04],
      [side * 0.14, 0.46, 0.28],
    );
    brow.rotation.z = side * 0.25;
    ball(puppet, cream, [0.23, 0.07, 0.07], [side * 0.3, -0.02, 0.15]);
    ball(puppet, gloveMaterial, [0.19, 0.2, 0.17], [side * 0.43, -0.025, 0.27]);
    ball(puppet, gloveMaterial, [0.09, 0.11, 0.1], [side * 0.31, -0.025, 0.34]);
    const curve = new CatmullRomCurve3([
      new Vector3(side * 0.16, 0.52, 0),
      new Vector3(side * 0.23, 0.75, -0.02),
      new Vector3(side * 0.38, 0.85, 0.04),
    ]);
    const antenna = new Mesh(
      new TubeGeometry(curve, 10, 0.014, 5, false),
      dark,
    );
    puppet.add(antenna);
    ball(puppet, cream, [0.065, 0.085, 0.055], [side * 0.38, 0.85, 0.04]);
  }
  // Shell-textured fur over the body and head; the solid felt is the root.
  const shells = [body, head].map((part) => {
    const fur = createFurShells(sphere, cream);
    fur.position.copy(part.position);
    fur.scale.copy(part.scale);
    puppet.add(fur);
    return fur;
  });
  root.rotation.y = team === 0 ? 0.3 : -0.3;
  // Remember every material's colour so a zap can char it and it can recover.
  const tintable: { material: MeshStandardMaterial; colour: Color }[] = [];
  function rememberColours() {
    tintable.length = 0;
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const list = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of list)
        if (
          material instanceof MeshStandardMaterial &&
          !tintable.some((item) => item.material === material)
        )
          tintable.push({ material, colour: material.color.clone() });
    });
  }
  rememberColours();
  // When the wooden figure is available it replaces the felt puppet: the
  // same body for everyone, with wings painted in the moth's own colour.
  let modelled = false;
  /** The wooden figure's arms and legs, left then right, once it is loaded. */
  const arms: Group[] = [];
  const legs: Group[] = [];
  void loadMothModel().then((model) => {
    if (!model) return;
    puppet.clear();
    wings.length = 0;
    shells.length = 0;
    const wood = new MeshStandardMaterial({
      map: model.map,
      roughness: 0.8,
      side: DoubleSide,
      emissive: 0xffffff,
      emissiveMap: model.map,
      emissiveIntensity: MOTH_LOOK.glow,
    });
    // The wings are pale blue-grey in the texture: tinting them well past
    // white brings out the team colour while keeping the painted stripe.
    const tint = new Color(color).multiplyScalar(1.7);
    const paint = new MeshStandardMaterial({
      map: model.map,
      color: tint,
      roughness: 0.85,
      side: DoubleSide,
      emissive: tint,
      emissiveMap: model.map,
      emissiveIntensity: MOTH_LOOK.glow,
    });
    const figure = new Mesh(model.body, wood);
    figure.castShadow = true;
    figure.receiveShadow = true;
    puppet.add(figure);
    for (const geometry of model.wings) {
      const wing = new Group();
      wing.position.set(0, model.hinge.y, model.hinge.z);
      const panel = new Mesh(geometry, paint);
      panel.castShadow = true;
      wing.add(panel);
      puppet.add(wing);
      wings.push(wing);
    }
    for (const [geometries, joints, limbs] of [
      [model.arms, model.shoulders, arms],
      [model.legs, model.hips, legs],
    ] as const)
      geometries.forEach((geometry, side) => {
        const joint = joints[side]!;
        const limb = new Group();
        limb.position.set(joint.x, joint.y, joint.z);
        const part = new Mesh(geometry, wood);
        part.castShadow = true;
        limb.add(part);
        puppet.add(limb);
        limbs.push(limb);
      });
    modelled = true;
    hands.forEach((hand, side) => arms[side]?.add(hand));
    rememberColours();
  });
  // A grip on each arm, at the hand, left then right. A weapon is held in
  // the right; boxing gloves are worn, one on each.
  const hands = [-1, 1].map((side) => {
    const hand = new Group();
    hand.position.set(side * HAND.x, HAND.y, HAND.z);
    return hand;
  });
  /** While the player is lining up a shot: how far it is charged, 0 to 1. */
  let charge: number | undefined;
  /** 1 at the instant of a shot, falling to 0 as the recoil settles. */
  let kick = 0;
  let wanted: WeaponId | undefined;
  let holding: WeaponId | undefined;
  function hold(weapon: WeaponId | undefined) {
    if (weapon === wanted) return;
    wanted = weapon;
    if (!weapon) {
      hands.forEach((hand) => hand.clear());
      holding = undefined;
      return;
    }
    void loadWeaponModel(weapon).then((model) => {
      // Skip a model that arrives after the moth has moved on to another.
      if (wanted !== weapon || holding === weapon) return;
      hands.forEach((hand) => hand.clear());
      holding = weapon;
      if (!model) return;
      hands[1]!.add(model.clone());
      if (WEAPON_GRIP[weapon].worn) {
        // The other glove is the same one, mirrored.
        const mirror = new Group();
        mirror.scale.x = -1;
        mirror.add(model.clone());
        hands[0]!.add(mirror);
      }
    });
  }
  const soot = new Color(0x1c1714);
  let char = 0;
  let lastSeconds = 0;
  let tumble = 0;
  return {
    root,
    /** Put a weapon in the moth's hand, or take it away. */
    hold,
    /** Line up a shot charged this far (0 to 1), or stop aiming. */
    aim(power: number | undefined) {
      charge = power;
    },
    /** The weapon has just gone off: jolt the arm and lean back. */
    recoil() {
      kick = 1;
    },
    animate(seconds: number, state: MothView) {
      const delta = Math.max(0, seconds - lastSeconds);
      lastSeconds = seconds;
      // Charred instantly by a zap, then slowly back to clean felt.
      const nextChar = state.zapped ? 1 : Math.max(0, char - delta * 0.35);
      if (nextChar !== char) {
        char = nextChar;
        for (const { material, colour } of tintable)
          material.color.copy(colour).lerp(soot, char * 0.82);
      }
      // A charred moth stops glowing until its felt recovers.
      for (const { material } of tintable)
        if (material.emissiveMap)
          material.emissiveIntensity = MOTH_LOOK.glow * (1 - char);
      if (state.zapped) {
        // Cartoon tumble: smooth spin, stiff limbs, wings flung wide.
        tumble += delta * 13;
        root.rotation.y = state.heading + tumble * 0.6;
        puppet.rotation.set(tumble, 0, Math.sin(tumble * 0.7) * 0.9);
        puppet.position.y = 0;
        wings.forEach((wing, index) => {
          wing.rotation.y = (index === 0 ? -1 : 1) * 1.1;
        });
        return;
      }
      tumble = 0;
      const steppedTime = Math.floor(seconds * 10) / 10;
      root.rotation.y = state.heading;
      for (const fur of shells) fur.count = FUR.layers;
      const walking = state.moving && state.grounded;
      puppet.rotation.z =
        Math.sin(steppedTime * (walking ? 16 : 1.8) + phase) *
        (walking ? 0.075 : 0.025);
      puppet.position.y = walking
        ? Math.abs(Math.sin(steppedTime * 16)) * 0.04
        : 0;
      puppet.rotation.x = !state.grounded && state.moving ? 0.16 : 0;
      if (state.punching) {
        // Throw the whole body into the punch.
        puppet.rotation.x = 0.35;
        puppet.position.z = 0.28;
      } else puppet.position.z = 0;
      puppet.rotation.y = 0;
      let wingSpread = state.fluttering
        ? 0.35 + Math.sin(steppedTime * 28) * 0.8
        : 0.15 + Math.sin(steppedTime * 3 + phase) * 0.08;
      // The wooden figure's big flat wings beat as it walks and breathe at
      // rest, so they are never still.
      if (modelled && !state.fluttering)
        wingSpread = walking
          ? 0.3 + Math.sin(steppedTime * 14 + phase) * 0.35
          : 0.22 + Math.sin(steppedTime * 3.2 + phase) * 0.2;
      if (state.dance) {
        // Stepped like the rest of the puppet, for a stop-motion routine.
        const t = Math.floor(state.danceTime * 12) / 12;
        if (state.dance === 1) {
          // The Spin: a pirouette with the wings flung wide.
          root.rotation.y = state.heading + t * 9;
          puppet.position.y = Math.abs(Math.sin(t * 9)) * 0.12;
          wingSpread = 1.1;
        } else if (state.dance === 2) {
          // The Wiggle: hips side to side with a little bounce.
          puppet.rotation.z = Math.sin(t * 16) * 0.5;
          puppet.rotation.y = Math.sin(t * 8) * 0.5;
          puppet.position.y = Math.abs(Math.sin(t * 16)) * 0.08;
        } else if (state.dance === 3) {
          // Shadow Boxing: jabs at nobody, switching sides.
          const jab = Math.sin(t * 14);
          puppet.rotation.y = Math.sign(jab) * 0.55;
          puppet.rotation.x = 0.3;
          puppet.position.z = Math.abs(jab) * 0.3;
          puppet.position.y = Math.abs(Math.sin(t * 7)) * 0.06;
        } else if (state.dance === 4) {
          // The Big Flap: star jumps with frantic wings.
          puppet.position.y = Math.abs(Math.sin(t * 7)) * 0.55;
          wingSpread = 0.4 + Math.sin(t * 30) * 0.9;
        } else {
          // The Worm: rocking flat out, nose to tail.
          puppet.rotation.x = 1.1 + Math.sin(t * 11) * 0.45;
          puppet.position.y = -0.18 + Math.abs(Math.sin(t * 11)) * 0.2;
          puppet.position.z = Math.sin(t * 5.5) * 0.25;
        }
      }
      wings.forEach((wing, index) => {
        wing.rotation.y = (index === 0 ? -1 : 1) * wingSpread;
      });
      if (!modelled) return;
      // The wooden figure moves smoothly: a stepped walk on a jointed body
      // reads as flicker. Negative angles swing a limb forwards.
      const stride = seconds * 13 + phase;
      let armSwing = [0, 0];
      let legSwing = [0, 0];
      let armLift = 0;
      let legSplay = 0;
      if (walking) {
        puppet.rotation.z = Math.sin(stride) * 0.06;
        puppet.position.y = Math.abs(Math.sin(stride)) * 0.05;
        puppet.rotation.x = 0.12;
        // The wings sit just behind the shoulders, so the arms pump mostly
        // in front of the body and are held a little out to the sides.
        armSwing = [
          -0.4 + Math.sin(stride) * 0.6,
          -0.4 - Math.sin(stride) * 0.6,
        ];
        armLift = 0.18;
        legSwing = [-Math.sin(stride) * 0.7, Math.sin(stride) * 0.7];
      } else if (!state.grounded) {
        // In the air: arms back and out, legs trailing and paddling a little.
        const kick = Math.sin(seconds * 18 + phase) * 0.2;
        armSwing = [-0.25, -0.25];
        armLift = 0.7;
        legSwing = [0.35 + kick, 0.35 - kick];
      } else {
        const breath = Math.sin(seconds * 2 + phase) * 0.06;
        armSwing = [breath, -breath];
      }
      if (state.punching) {
        armSwing = [-1.5, -1.3];
        legSwing = [-0.4, 0.5];
      }
      if (state.dance) {
        const beat = state.danceTime;
        if (state.dance === 1) {
          // The Spin: arms flung out.
          armLift = 1.2;
        } else if (state.dance === 2) {
          armSwing = [Math.sin(beat * 16) * 0.8, -Math.sin(beat * 16) * 0.8];
          legSwing = [Math.sin(beat * 16) * 0.3, -Math.sin(beat * 16) * 0.3];
        } else if (state.dance === 3) {
          // Shadow Boxing: one fist out, then the other.
          const jab = Math.sin(beat * 14);
          armSwing = [jab > 0 ? -1.5 : -0.4, jab > 0 ? -0.4 : -1.5];
        } else if (state.dance === 4) {
          // The Big Flap: star jumps.
          const jump = Math.abs(Math.sin(beat * 7));
          armLift = jump * 1.4;
          legSplay = jump * 0.5;
        } else {
          armSwing = [-2.6, -2.6];
        }
      }
      // An armed moth holds its weapon out in front in its right hand,
      // unless it is dancing or tumbling. Gloves are worn, so those arms
      // swing and punch as usual.
      const worn = holding !== undefined && WEAPON_GRIP[holding].worn;
      const carrying =
        holding !== undefined &&
        !worn &&
        !state.dance &&
        !state.zapped &&
        !state.punching;
      let rightLift = armLift;
      kick = Math.max(0, kick - delta / 0.3);
      const pull = carrying ? (charge ?? 0) : 0;
      if (carrying) {
        const bob = Math.sin(walking ? stride * 2 : seconds * 3 + phase) * 0.05;
        // Aiming brings the weapon up and in line; a shot jolts the arm up.
        const aimed = charge !== undefined;
        armSwing[1] = (aimed ? -1.5 : -1.25 + bob) - kick * 0.55;
        rightLift = aimed ? 0.12 : 0.3;
        puppet.rotation.x += (aimed ? 0.1 + pull * 0.08 : 0) - kick * 0.16;
      }
      // Charging draws the weapon back, trembling as it nears full power;
      // the recoil throws it back further still.
      const tremble = Math.sin(seconds * 70) * 0.012 * pull * pull;
      hands[1]!.position.set(
        HAND.x + tremble,
        HAND.y,
        HAND.z - pull * 0.13 - kick * 0.1,
      );
      arms.forEach((arm, side) => {
        arm.rotation.x = armSwing[side] ?? 0;
        arm.rotation.z = side === 0 ? -armLift : rightLift;
      });
      // A held weapon stays level whatever the arm does; a glove turns with
      // the arm it is on.
      const arm = arms[1];
      if (arm && !worn)
        hands[1]!.rotation.set(-arm.rotation.x, 0, -arm.rotation.z);
      else hands[1]!.rotation.set(0, 0, 0);
      const shown = worn ? !state.zapped : carrying;
      hands.forEach((hand) => (hand.visible = shown));
      legs.forEach((leg, side) => {
        leg.rotation.x = legSwing[side] ?? 0;
        leg.rotation.z = (side === 0 ? -1 : 1) * legSplay;
      });
    },
  };
}
