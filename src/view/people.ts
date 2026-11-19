import {
  CapsuleGeometry,
  CylinderGeometry,
  Euler,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { ARENA, HAZARD, PEOPLE, ROOM } from '../config';
import type { WorldView } from '../game/world';
import { WRIST, createHandMesh, handPose } from './hand';
import type { createMaterials } from './materials';

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
    return {
      body,
      legs,
      torso,
      arms,
      materials: [skin, top, trousers, hair, dark],
      facing: 0,
      placed: false,
      stride: 1,
      lean: 0,
    };
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

  return {
    root,
    animate(
      seconds: number,
      delta: number,
      view: WorldView,
      eye: Vector3,
      focus: Vector3,
    ) {
      const strikeNow = view.hazards[0];
      const ease = (rate: number) => 1 - Math.exp(-delta * rate);
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
            part.visible = !!state;
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
        const lean = hit ? smooth((reachOut - 12) / 34) * 1.15 : 0;
        person.lean += (lean - person.lean) * ease(7);
        person.body.position.set(
          state.x,
          Math.abs(Math.sin(step)) * 0.9 * person.stride,
          state.z,
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
          shoulderAt.set(-arm.side * SHOULDER, TORSO - 3, 0);
          person.torso.localToWorld(shoulderAt);
          // Hanging by the side, swinging against the legs.
          const sway =
            Math.sin(step + (arm.side > 0 ? 0 : Math.PI)) * 5 * person.stride;
          restAt
            .set(-arm.side * 2, -(UPPER_ARM + FOREARM) - 2, sway + 2)
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
          (Math.hypot(eye.x - state.x, eye.z - state.z) - 12) / 14,
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
            ((state.x - eye.x) * vx + (state.z - eye.z) * vz) /
            Math.max(vx * vx + vz * vz, 1e-6);
          if (t <= 0 || t >= 1) continue;
          const off = Math.hypot(
            state.x - (eye.x + vx * t),
            state.z - (eye.z + vz * t),
          );
          opacity = Math.min(opacity, smooth((off - 10) / 14));
        }
        opacity = Math.max(0.16, Math.min(1, opacity));
        for (const material of person.materials) {
          material.transparent = opacity < 1;
          material.opacity = opacity;
        }
      });
    },
  };
}
