import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { ARENA, HAZARD } from '../config';
import type { HazardView } from '../game/world';
import type { createMaterials } from './materials';

/** A felt wind-up mouse with a spinning key, and the track it runs on. */
export function createMouse(materials: ReturnType<typeof createMaterials>) {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const grey = materials.felt(0x9a9aa6);
  const pink = materials.felt(0xe79aa6);
  const dark = new MeshStandardMaterial({ color: 0x1b1718, roughness: 0.3 });
  const brass = new MeshStandardMaterial({
    color: 0xd8a94a,
    roughness: 0.35,
    metalness: 0.7,
  });
  // A little self-lit, like the moths, so it is easy to spot coming.
  for (const material of [grey, pink]) {
    material.emissive.copy(material.color);
    material.emissiveMap = material.map;
    material.emissiveIntensity = 0.35;
  }
  const sphere = new SphereGeometry(1, 20, 14);
  const size = HAZARD.radius;
  function ball(
    material: MeshStandardMaterial,
    scale: [number, number, number],
    position: [number, number, number],
    parent: Group = body,
  ) {
    const mesh = new Mesh(sphere, material);
    mesh.scale.set(scale[0] * size, scale[1] * size, scale[2] * size);
    mesh.position.set(
      position[0] * size,
      position[1] * size,
      position[2] * size,
    );
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  // The mouse faces +Z, matching a moth's heading.
  ball(grey, [0.75, 0.62, 1.1], [0, 0, 0]);
  ball(grey, [0.5, 0.45, 0.6], [0, -0.05, 1.05]);
  ball(pink, [0.13, 0.11, 0.13], [0, -0.1, 1.62]);
  for (const side of [-1, 1]) {
    ball(grey, [0.3, 0.32, 0.08], [side * 0.42, 0.5, 0.75]);
    ball(pink, [0.2, 0.22, 0.05], [side * 0.42, 0.5, 0.8]);
    ball(dark, [0.09, 0.1, 0.07], [side * 0.26, 0.18, 1.42]);
    ball(dark, [0.2, 0.2, 0.12], [side * 0.6, -0.5, 0.45]);
    ball(dark, [0.2, 0.2, 0.12], [side * 0.6, -0.5, -0.5]);
  }
  const tail = new Mesh(new CylinderGeometry(0.03, 0.05, size * 1.3, 6), pink);
  tail.rotation.x = Math.PI / 2 - 0.5;
  tail.position.set(0, size * 0.15, -size * 1.55);
  body.add(tail);
  // The wind-up key on its back turns as it goes.
  const key = new Group();
  key.position.set(0, size * 0.62, -size * 0.2);
  const stem = new Mesh(
    new CylinderGeometry(0.035, 0.035, size * 0.5, 6),
    brass,
  );
  stem.position.y = size * 0.2;
  const loop = new Mesh(new TorusGeometry(size * 0.26, 0.04, 6, 16), brass);
  loop.position.y = size * 0.62;
  key.add(stem, loop);
  body.add(key);

  // A faint dotted oval on the desk shows where it will run.
  const points: Vector3[] = [];
  for (let i = 0; i < 160; i++) {
    const angle = (i / 160) * Math.PI * 2;
    points.push(
      new Vector3(
        Math.cos(angle) * ARENA.track.rx,
        0.02,
        Math.sin(angle) * ARENA.track.rz,
      ),
    );
  }
  const track = new LineLoop(
    new BufferGeometry().setFromPoints(points),
    new LineBasicMaterial({
      color: 0xf1e3c6,
      transparent: true,
      opacity: 0.28,
    }),
  );
  return {
    root,
    track,
    animate(seconds: number, state: HazardView | undefined) {
      root.visible = !!state;
      if (!state) return;
      root.position.set(state.x, state.y, state.z);
      root.rotation.y = state.heading;
      // Stepped like the moths, for the same stop-motion feel.
      const stepped = Math.floor(seconds * 12) / 12;
      key.rotation.y = stepped * (state.startled ? 22 : 9);
      body.position.y = Math.abs(Math.sin(stepped * 14)) * 0.05;
      body.rotation.z = Math.sin(stepped * 14) * (state.startled ? 0.22 : 0.07);
    },
  };
}
