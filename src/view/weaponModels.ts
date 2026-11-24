import { Box3, Group, Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WEAPONS } from '../config';
import type { WeaponId } from '../config';

/** Where each weapon's model lives, under the page's base path. */
export const weaponModelUrl = (id: WeaponId) =>
  `models/artlist/weapon-${id}.glb`;

/**
 * How a weapon is carried: its longest side in world units, and how it is
 * turned and placed from the right hand to sit over the moth's head. The models arrive facing all
 * ways, so each is lined up here by eye:
 * they come out as their picture seen from the front (+z).
 */
export const WEAPON_GRIP: Record<
  WeaponId,
  {
    size: number;
    turn: [number, number, number];
    offset: [number, number, number];
  }
> = {
  gust: { size: 0.5, turn: [0, 0, 0], offset: [-0.21, 0.2, 0.02] },
  bosh: { size: 0.42, turn: [0, 0, 0], offset: [-0.21, 0.17, 0] },
  zap: { size: 0.42, turn: [0, 0, 0], offset: [-0.21, 0.24, 0] },
  cap: { size: 0.46, turn: [0, Math.PI, 0], offset: [-0.21, 0.2, 0] },
  firecracker: {
    size: 0.56,
    turn: [0, Math.PI / 2, 0],
    offset: [-0.21, 0.16, 0],
  },
};

const pending = new Map<WeaponId, Promise<Group | undefined>>();

/**
 * Load a weapon's model once, centred and scaled to its grip size; undefined
 * when the file is missing or broken, in which case the hand stays empty.
 */
export function loadWeaponModel(id: WeaponId) {
  let model = pending.get(id);
  if (!model) {
    model = new Promise<Group | undefined>((resolve) => {
      try {
        new GLTFLoader().load(
          weaponModelUrl(id),
          (gltf) => {
            try {
              resolve(fit(gltf.scene, id));
            } catch {
              resolve(undefined);
            }
          },
          undefined,
          () => resolve(undefined),
        );
      } catch {
        resolve(undefined);
      }
    });
    pending.set(id, model);
  }
  return model;
}

function fit(scene: Group, id: WeaponId) {
  const grip = WEAPON_GRIP[id];
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (!(longest > 0)) return undefined;
  const centre = box.getCenter(new Vector3());
  scene.position.sub(centre);
  scene.traverse((object) => {
    if (object instanceof Mesh) object.castShadow = true;
  });
  // Centred inside one group, turned in a second, placed by a third.
  const turned = new Group();
  turned.add(scene);
  turned.rotation.set(...grip.turn);
  const held = new Group();
  held.add(turned);
  held.scale.setScalar(grip.size / longest);
  held.position.set(...grip.offset);
  return held;
}

/** Start every weapon loading, so the first switch does not pop in late. */
export function preloadWeaponModels() {
  for (const { id } of WEAPONS) void loadWeaponModel(id);
}
