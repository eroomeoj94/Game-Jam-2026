import {
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { ARENA, HAZARD, MIND, PEOPLE, ROOM } from '../config';
import type { WorldView } from '../game/world';
import { WRIST, createHandMesh, handPose } from './hand';
import type { createMaterials } from './materials';
import { GIANT_MODEL_HEIGHT, loadGiantModel } from './giantModel';

const LOOKS = [
  { skin: 0xf0c9a4, top: 0xb04a3a, legs: 0x34415e, hair: 0x3a2a20 },
  { skin: 0x8a5a3a, top: 0xd8c79a, legs: 0x4a4038, hair: 0x15110f },
  { skin: 0xd9a577, top: 0x4a6b5a, legs: 0x2f3038, hair: 0xb9793a },
  { skin: 0x5f3d2a, top: 0x6c5a86, legs: 0x5a6470, hair: 0x201a18 },
  { skin: 0xf3d4b8, top: 0x3f5d87, legs: 0x6b5a44, hair: 0xd9c9a0 },
];
// Sizes in desk units: a moth is about one unit across, the desk top is at 0.
const HIP = 6;
const TORSO = 32;
const SHOULDER = 10.5;
const UPPER_ARM = 18;
const FOREARM = 17;
const HEAD = 6.5;
const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);

const smooth = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

/**
 * The giants who pace round the desk and smack it. They are always in view;
 * anyone standing between the camera and the desk turns see-through.
 */
export function createPeople(materials: ReturnType<typeof createMaterials>) {
  const root = new Group();
  const legLength = HIP - ROOM.floorY;
  const unitLimb = new CylinderGeometry(1, 1, 1, 14);
  const ball = new SphereGeometry(1, 18, 12);

  const people = Array.from({ length: PEOPLE.count }, (_, index) => {
    const look = LOOKS[index % LOOKS.length]!;
    const felt = (colour: number) => {
      const material = materials.felt(colour);
      // Self-lit like the moths: they stand outside every lamp's light.
      material.emissive.copy(material.color);
      material.emissiveMap = material.map;
      material.emissiveIntensity = 0.3;
      return material;
    };
    const skin = felt(look.skin);
    const top = felt(look.top);
    const trousers = felt(look.legs);
    const hair = felt(look.hair);
    const dark = new MeshStandardMaterial({ color: 0x1b1718, roughness: 0.6 });
    const body = new Group();
    root.add(body);
    const add = (
      parent: Group,
      mesh: Mesh,
      position: [number, number, number],
      scale: [number, number, number] = [1, 1, 1],
    ) => {
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      parent.add(mesh);
      return mesh;
    };
    const legs = [-1, 1].map((side) => {
      const leg = new Group();
      leg.position.set(side * 4.6, HIP, 0);
      add(
        leg,
        new Mesh(new CapsuleGeometry(3.7, legLength - 9, 6, 14), trousers),
        [0, -legLength / 2 + 1, 0],
      );
      add(leg, new Mesh(ball, dark), [0, -legLength + 2, 2.6], [3.9, 2, 6.4]);
      body.add(leg);
      return leg;
    });
    // The torso bends at the hips to lean over the desk.
    const torso = new Group();
    torso.position.y = HIP;
    body.add(torso);
    add(
      torso,
      new Mesh(new CapsuleGeometry(8, TORSO - 14, 8, 18), top),
      [0, TORSO / 2 - 1, 0],
      [1.3, 1, 0.82],
    );
    add(torso, new Mesh(ball, trousers), [0, 0, 0], [10, 5, 6.6]);
    add(torso, new Mesh(unitLimb, skin), [0, TORSO + 1.5, 0], [2.7, 4, 2.7]);
    const headY = TORSO + 3 + HEAD;
    add(
      torso,
      new Mesh(ball, skin),
      [0, headY, 0.4],
      [HEAD * 0.92, HEAD * 1.08, HEAD * 0.96],
    );
    const cap = add(
      torso,
      new Mesh(
        new SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
        hair,
      ),
      [0, headY + 0.5, -0.3],
      [HEAD, HEAD * 1.1, HEAD * 1.04],
    );
    cap.rotation.x = -0.35;
    for (const side of [-1, 1])
      add(
        torso,
        new Mesh(ball, dark),
        [side * 2.4, headY + 0.6, HEAD * 0.9],
        [0.8, 1, 0.5],
      );
    add(torso, new Mesh(ball, skin), [0, headY - 1, HEAD], [0.9, 1.1, 1]);

    // Arms are posed in desk space each frame, from shoulder to wrist.
    const arms = ([1, -1] as const).map((side) => {
      const upper = new Mesh(unitLimb, top);
      const fore = new Mesh(unitLimb, top);
      const shoulder = new Mesh(ball, top);
      const elbow = new Mesh(ball, top);
      shoulder.scale.setScalar(3.6);
      elbow.scale.setScalar(2.9);
      const hand = createHandMesh(skin);
      for (const mesh of [upper, fore, shoulder, elbow]) mesh.castShadow = true;
      root.add(upper, fore, shoulder, elbow, hand);
      // 0 hanging at the side, 1 out over the desk.
      return { side, upper, fore, shoulder, elbow, hand, reach: 0 };
    });
    const person = {
      body,
      legs,
      torso,
      arms,
      materials: [skin, top, trousers, hair, dark] as MeshStandardMaterial[],
      facing: 0,
      placed: false,
      stride: 1,
      lean: 0,
      // Where the shoulders are on the torso, and how long an arm hangs.
      shoulderX: SHOULDER,
      shoulderY: TORSO - 3,
      armLength: UPPER_ARM + FOREARM + 2,
      /** The wooden figure's own arms, right then left, once it has loaded. */
      modelArms: undefined as Group[] | undefined,
      /** How far a wooden arm hangs, and its scale, in desk units. */
      modelArmLength: 1,
      modelScale: 1,
      /** How wide they are, for fading them out of the camera's way. */
      bulk: 10,
      /** How much further from the desk than their path they stand. */
      setback: 0,
      /** The furthest they bend over the desk, in radians. */
      maxLean: 1.15,
      /** Seconds left under a Mind Control spell. */
      spell: 0,
    };
    // When this giant's wooden figure is available it replaces the felt
    // one: the same walk, lean and smack, with the figure's own limbs.
    void loadGiantModel(index).then((model) => {
      if (!model) return;
      const { cut } = model;
      // Each figure has its own height: sized to one height, the big-headed
      // ones would be far too wide to stand round the desk.
      const scale = cut.height / GIANT_MODEL_HEIGHT;
      const height = (y: number) =>
        ROOM.floorY + (y + GIANT_MODEL_HEIGHT / 2) * scale;
      const wood = new MeshStandardMaterial({
        map: model.map,
        roughness: 0.8,
        emissive: 0xffffff,
        emissiveMap: model.map,
        emissiveIntensity: 0.3,
        // The cut ends of the limbs are open, so both faces are drawn.
        side: DoubleSide,
      });
      const piece = (geometry: (typeof model)['body']) => {
        const mesh = new Mesh(geometry, wood);
        mesh.scale.setScalar(scale);
        mesh.castShadow = true;
        return mesh;
      };
      const hipY = height(cut.hip.y);
      torso.clear();
      torso.position.y = hipY;
      torso.add(piece(model.body));
      legs.forEach((leg, side) => {
        leg.clear();
        leg.position.set((side ? 1 : -1) * cut.hip.x * scale, hipY, 0);
        leg.add(piece(model.legs[side]!));
      });
      person.modelArms = model.arms.map((geometry) => {
        const arm = new Group();
        arm.add(new Mesh(geometry, wood));
        (arm.children[0] as Mesh).castShadow = true;
        root.add(arm);
        return arm;
      });
      person.shoulderX = cut.shoulder.x * scale;
      person.shoulderY = (cut.shoulder.y - cut.hip.y) * scale;
      // Measured to the middle of the hand, which is what lands on the desk.
      person.modelArmLength = (cut.shoulder.y - cut.armBottom - 0.07) * scale;
      person.armLength = person.modelArmLength;
      person.modelScale = scale;
      person.materials = [wood];
      // The wooden figures have big heads and take up far more of the view.
      person.bulk = cut.girth * scale + 4;
      // Stood back so that neither belly nor shoulders poke into the desk.
      person.setback = Math.max(0, cut.girth * scale + 3 - PEOPLE.offset);
      person.maxLean = 0.45;
    });
    return person;
  });

  const shoulderAt = new Vector3();
  const wristAt = new Vector3();
  const elbowAt = new Vector3();
  const along = new Vector3();
  const pole = new Vector3();
  const restAt = new Vector3();
  const strikeAt = new Vector3();
  const rest = new Quaternion();
  const strike = new Quaternion();
  const turn = new Euler(0, 0, 0, 'YXZ');
  /** Stretch a unit limb from `from` to `to`. */
  function span(mesh: Mesh, from: Vector3, to: Vector3, radius: number) {
    along.subVectors(to, from);
    const length = along.length() || 1e-3;
    mesh.position.copy(from).addScaledVector(along, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, along.divideScalar(length));
    mesh.scale.set(radius, length, radius);
  }

  /** The giant a Mind Control is being aimed at, if any. */
  let picked: number | undefined;
  const PURPLE = new Color(0xb48cff);
  return {
    root,
    /** Mark the giant a Mind Control would take over; undefined clears it. */
    highlight(index: number | undefined) {
      picked = index;
    },
    /** A Mind Control has taken hold of this giant: glow until it wears off. */
    enthral(index: number) {
      const person = people[index];
      if (person) person.spell = MIND.spellSeconds;
    },
    /**
     * Make every giant solid for a second view of the same frame; call the
     * function it returns to put their see-through fade back.
     */
    showSolid() {
      const faded = people.flatMap((person) =>
        person.materials.map((material) => ({
          material,
          opacity: material.opacity,
          transparent: material.transparent,
        })),
      );
      for (const { material } of faded) {
        material.opacity = 1;
        material.transparent = false;
      }
      return () => {
        for (const { material, opacity, transparent } of faded) {
          material.opacity = opacity;
          material.transparent = transparent;
        }
      };
    },
    animate(
      seconds: number,
      delta: number,
      view: WorldView,
      eye: Vector3,
      focus: Vector3,
    ) {
      const strikeNow = view.hazards[0];
      const ease = (rate: number) => 1 - Math.exp(-delta * rate);
      const halfWide = ARENA.desk.width / 2;
      const halfDeep = ARENA.desk.depth / 2;
      people.forEach((person, index) => {
        const state = view.people[index];
        person.body.visible = !!state;
        for (const arm of person.arms)
          for (const part of [
            arm.upper,
            arm.fore,
            arm.shoulder,
            arm.elbow,
            arm.hand,
          ])
            part.visible = !!state && !person.modelArms;
        for (const arm of person.modelArms ?? []) arm.visible = !!state;
        if (!state) return;
        const hit = strikeNow?.person === index ? strikeNow : undefined;
        // Turn smoothly to face the way they walk, or the spot they will hit.
        const swing = Math.atan2(
          Math.sin(state.heading - person.facing),
          Math.cos(state.heading - person.facing),
        );
        person.facing += person.placed ? swing * ease(5) : swing;
        person.placed = true;
        person.stride += ((hit ? 0 : 1) - person.stride) * ease(8);
        // Stepped like the moths, for the same stop-motion feel.
        const step = Math.round((state.walked / 5.2) * 5) / 5;
        const reachOut = hit ? Math.hypot(hit.x - state.x, hit.z - state.z) : 0;
        const lean = hit ? smooth((reachOut - 12) / 34) * person.maxLean : 0;
        person.lean += (lean - person.lean) * ease(7);
        // Straight out from the nearest point of the desk's edge.
        const edgeX = Math.max(-halfWide, Math.min(halfWide, state.x));
        const edgeZ = Math.max(-halfDeep, Math.min(halfDeep, state.z));
        const out = Math.hypot(state.x - edgeX, state.z - edgeZ) || 1;
        const standX = state.x + ((state.x - edgeX) / out) * person.setback;
        const standZ = state.z + ((state.z - edgeZ) / out) * person.setback;
        person.body.position.set(
          standX,
          Math.abs(Math.sin(step)) * 0.9 * person.stride,
          standZ,
        );
        person.body.rotation.y = person.facing;
        person.legs.forEach((leg, side) => {
          leg.rotation.x =
            Math.sin(step + side * Math.PI) * 0.42 * person.stride;
        });
        person.torso.rotation.x = person.lean;
        person.body.updateMatrixWorld(true);

        for (const arm of person.arms) {
          const striking = hit?.side === arm.side ? hit : undefined;
          arm.reach += ((striking ? 1 : 0) - arm.reach) * ease(9);
          // A figure facing +Z has its right shoulder on -X.
          shoulderAt.set(-arm.side * person.shoulderX, person.shoulderY, 0);
          person.torso.localToWorld(shoulderAt);
          // Hanging by the side, swinging against the legs.
          const sway =
            Math.sin(step + (arm.side > 0 ? 0 : Math.PI)) * 5 * person.stride;
          restAt
            .set(-arm.side * 2, -person.armLength, sway + 2)
            .applyAxisAngle(UP, person.facing)
            .add(shoulderAt);
          turn.set(Math.PI / 2 - 0.15, person.facing, 0);
          rest.setFromEuler(turn);
          let squash = 1;
          if (striking) {
            const pose = handPose(striking, seconds);
            squash = pose.squash;
            strikeAt.set(striking.x, striking.y + pose.height, striking.z);
            turn.set(-pose.tilt, striking.heading, 0);
            strike.setFromEuler(turn);
            arm.hand.position.lerpVectors(restAt, strikeAt, arm.reach);
            arm.hand.quaternion.slerpQuaternions(rest, strike, arm.reach);
          } else {
            // Still swinging back from the last smack.
            arm.hand.position.lerp(restAt, 1 - arm.reach);
            arm.hand.quaternion.slerp(rest, 1 - arm.reach);
          }
          arm.hand.scale.set(arm.side, squash, 1);
          arm.hand.updateMatrixWorld(true);
          const wooden = person.modelArms?.[arm.side > 0 ? 0 : 1];
          if (wooden) {
            // A wooden arm is one stiff piece: it swings from the shoulder
            // to point at where the hand should be, and stretches to reach.
            along.subVectors(arm.hand.position, shoulderAt);
            // The middle of the hand stops just above the desk, not in it.
            along.y += arm.reach * person.modelScale * 0.04;
            const gap = Math.max(along.length(), 1e-3);
            turn.set(0, person.facing, 0);
            wooden.position.copy(shoulderAt);
            wooden.quaternion
              .setFromUnitVectors(DOWN, along.divideScalar(gap))
              .multiply(rest.setFromEuler(turn));
            wooden.scale.set(
              person.modelScale,
              person.modelScale * (gap / person.modelArmLength),
              person.modelScale,
            );
            continue;
          }
          wristAt.copy(WRIST);
          arm.hand.localToWorld(wristAt);
          // Two-bone arm: the elbow sits on a circle between shoulder and
          // wrist, pushed back when hanging and up and out when reaching.
          along.subVectors(wristAt, shoulderAt);
          const gap = Math.max(along.length(), 1e-3);
          const stretch = Math.max(1, gap / ((UPPER_ARM + FOREARM) * 0.98));
          const upper = UPPER_ARM * stretch;
          const fore = FOREARM * stretch;
          const toElbow = (upper * upper - fore * fore + gap * gap) / (2 * gap);
          const bend = Math.sqrt(Math.max(0, upper * upper - toElbow ** 2));
          along.divideScalar(gap);
          pole
            .set(-arm.side * 0.7 * arm.reach, arm.reach, -(1 - arm.reach))
            .applyAxisAngle(UP, person.facing);
          pole.addScaledVector(along, -pole.dot(along));
          if (pole.lengthSq() < 1e-6) pole.set(0, 0, -1);
          pole.normalize();
          elbowAt
            .copy(shoulderAt)
            .addScaledVector(along, toElbow)
            .addScaledVector(pole, bend);
          arm.shoulder.position.copy(shoulderAt);
          arm.elbow.position.copy(elbowAt);
          span(arm.upper, shoulderAt, elbowAt, 3.2);
          span(arm.fore, elbowAt, wristAt, 2.6);
        }

        // See-through when the camera is on top of them, when their hand
        // lands on it, or when they stand between the camera and the desk.
        let opacity = smooth(
          (Math.hypot(eye.x - standX, eye.z - standZ) - person.bulk - 2) / 14,
        );
        if (hit)
          opacity = Math.min(
            opacity,
            (Math.hypot(eye.x - hit.x, eye.z - hit.z) - HAZARD.radius) /
              (HAZARD.radius * 2),
          );
        for (let sample = -1; sample <= 2; sample++) {
          // Sight lines to the camera's focus and to points across the desk.
          const tx = sample > 1 ? focus.x : (sample * ARENA.desk.width) / 2.4;
          const tz = sample > 1 ? focus.z : 0;
          const vx = tx - eye.x;
          const vz = tz - eye.z;
          const t =
            ((standX - eye.x) * vx + (standZ - eye.z) * vz) /
            Math.max(vx * vx + vz * vz, 1e-6);
          if (t <= 0 || t >= 1) continue;
          const off = Math.hypot(
            standX - (eye.x + vx * t),
            standZ - (eye.z + vz * t),
          );
          opacity = Math.min(opacity, smooth((off - person.bulk) / 14));
        }
        // Purple and glowing while picked for, or under, a Mind Control.
        person.spell = Math.max(0, person.spell - delta);
        const glow =
          person.spell > 0
            ? 1
            : picked === index
              ? 0.55 + 0.25 * Math.sin(seconds * 9)
              : 0;
        for (const material of person.materials) {
          const base = (material.userData.base ??= {
            colour: material.emissive.clone(),
            strength: material.emissiveIntensity,
          }) as { colour: Color; strength: number };
          material.emissive.copy(base.colour).lerp(PURPLE, Math.min(1, glow));
          material.emissiveIntensity = base.strength + glow * 0.9;
        }
        // Whoever is picked or enthralled is never faded out of view.
        if (glow > 0) opacity = Math.max(opacity, 0.85);
        opacity = Math.max(0.16, Math.min(1, opacity));
        for (const material of person.materials) {
          material.transparent = opacity < 1;
          material.opacity = opacity;
        }
      });
    },
  };
}
