import {
  CapsuleGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import type { MeshStandardMaterial } from 'three';
import { HAZARD } from '../config';
import type { HazardView } from '../game/world';

/** How high the hand is held when its shadow first appears. */
const RAISED = 13;
/** How much further it draws back before the slam. */
const DRAW_BACK = 7;
/** Fraction of the warning spent raised; the rest is the slam. */
const SLAM_AT = 0.82;

/**
 * A giant right hand lying palm down with its fingers along +Z. Its origin is
 * the centre of the hit circle, between palm and fingers, so the whole hand
 * sits inside it. Mirror it in X for a left hand.
 */
export function createHandMesh(skin: MeshStandardMaterial) {
  const size = HAZARD.radius;
  const hand = new Group();
  const part = (mesh: Mesh) => {
    mesh.castShadow = true;
    hand.add(mesh);
    return mesh;
  };
  const thickness = size * 0.2;
  const palm = part(new Mesh(new SphereGeometry(1, 24, 16), skin));
  palm.scale.set(size * 0.62, thickness, size * 0.6);
  palm.position.set(0, thickness, -size * 0.38);
  const finger = new CapsuleGeometry(size * 0.13, size * 0.62, 6, 12);
  [-0.42, -0.14, 0.14, 0.42].forEach((offset, index) => {
    const mesh = part(new Mesh(finger, skin));
    mesh.rotation.x = Math.PI / 2;
    mesh.rotation.z = -offset * 0.45;
    const length = [0.86, 1, 0.96, 0.78][index]!;
    mesh.scale.y = length;
    mesh.position.set(
      size * offset * 1.05,
      thickness * 0.8,
      size * (0.1 + 0.38 * length) - Math.abs(offset) * size * 0.12,
    );
  });
  const thumb = part(
    new Mesh(new CapsuleGeometry(size * 0.15, size * 0.42, 6, 12), skin),
  );
  thumb.rotation.x = Math.PI / 2;
  thumb.rotation.z = -1;
  thumb.position.set(size * 0.72, thickness * 0.8, -size * 0.3);
  const wrist = part(
    new Mesh(
      new CylinderGeometry(size * 0.3, size * 0.27, size * 0.5, 16),
      skin,
    ),
  );
  wrist.rotation.x = Math.PI / 2;
  wrist.position.set(0, thickness, -size * 0.95);
  return hand;
}
/** Where the forearm joins the hand, in the hand's own space. */
export const WRIST = new Vector3(0, HAZARD.radius * 0.2, -HAZARD.radius * 1.15);

/** How the smacking hand is held: height above where it lands, and tilt. */
export function handPose(state: HazardView, seconds: number) {
  const { phase, progress } = state;
  if (phase === 'warning') {
    if (progress < SLAM_AT) {
      const t = progress / SLAM_AT;
      // Stepped like the moths, for the same stop-motion feel.
      const wobble = Math.sin(Math.floor(seconds * 12) * 1.9) * 0.3;
      return {
        height: RAISED + DRAW_BACK * t * t + wobble,
        tilt: 0.25 + 0.3 * t * t,
        squash: 1,
      };
    }
    const t = (progress - SLAM_AT) / (1 - SLAM_AT);
    return {
      height: (RAISED + DRAW_BACK) * (1 - t * t),
      tilt: 0.55 * (1 - t),
      squash: 1,
    };
  }
  if (phase === 'down')
    // Flattens against the desk for a moment on landing.
    return { height: 0, tilt: 0, squash: 0.8 + 0.2 * progress };
  return {
    height: RAISED * progress * (2 - progress),
    tilt: 0.3 * progress,
    squash: 1,
  };
}

/** Where a hand will land: a shadow that tightens, and the exact hit ring. */
export function createWarning() {
  const size = HAZARD.radius;
  const root = new Group();
  const shadow = new Mesh(
    new CircleGeometry(size, 40),
    new MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  const ring = new Mesh(
    new RingGeometry(size - 0.14, size, 56),
    new MeshBasicMaterial({
      color: 0xff5a3c,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  shadow.rotation.x = ring.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  ring.position.y = 0.06;
  shadow.renderOrder = 1;
  ring.renderOrder = 2;
  root.add(shadow, ring);
  root.visible = false;
  return {
    root,
    animate(seconds: number, state: HazardView | undefined) {
      root.visible = !!state;
      if (!state) return;
      root.position.set(state.x, 0, state.z);
      const { phase, progress } = state;
      const warn = phase === 'warning' ? progress : 0;
      const fade = phase === 'lifting' ? 1 - progress : 1;
      shadow.scale.setScalar(phase === 'warning' ? 1.5 - 0.5 * warn : 1);
      shadow.material.opacity =
        (phase === 'warning' ? 0.12 + 0.4 * warn : 0.5) * fade;
      // The ring blinks faster as the hand gets close.
      ring.material.opacity =
        phase === 'warning'
          ? (0.55 + 0.45 * Math.sin(seconds * (6 + 22 * warn))) * 0.85
          : 0;
    },
  };
}
