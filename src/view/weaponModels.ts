import { Box3, Group, Mesh, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WEAPONS } from '../config';
import type { WeaponId } from '../config';

/** Where each weapon's model lives, under the page's base path. */
export const weaponModelUrl = (id: WeaponId) =>
  `models/artlist/weapon-${id}.glb`;

/**
 * How a weapon sits in the hand: its longest side in world units, how it is
 * turned, and where its middle goes from the hand so the grip lands in it.
 * The models arrive as their picture seen from the front (+z), so each is
 * lined up here by eye. `worn` weapons go on both hands and turn with the
 * arm; `keep` cuts a two-part model down to the part left of that line.
 */
export const WEAPON_GRIP: Record<
  WeaponId,
  {
    size: number;
    turn: [number, number, number];
    offset: [number, number, number];
    worn?: boolean;
    keep?: number;
  }
> = {
  // The fan's handle hangs under its body.
  gust: { size: 0.5, turn: [0, 0, 0], offset: [0, 0.13, 0.04] },
  // One glove of the pair, fist down the arm and cuff up it.
  bosh: {
    size: 0.3,
    turn: [Math.PI, 0, 0],
    offset: [0, -0.05, 0.02],
    worn: true,
    keep: 0.02,
  },
  // The lantern hangs from its hook.
  zap: { size: 0.4, turn: [0, 0, 0], offset: [0, -0.2, 0] },
  // The slingshot is held by the bottom of its fork.
  cap: { size: 0.46, turn: [0, Math.PI, 0], offset: [0, 0.14, 0] },
  // The cannon's pistol grip is under the back of the barrel.
  firecracker: {
    size: 0.56,
    turn: [0, Math.PI / 2, 0],
    offset: [0, 0.1, 0.14],
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
  if (grip.keep !== undefined) keepLeft(scene, grip.keep);
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

/**
 * Drop every triangle whose middle is right of `line`, a share of the model's
 * width from its centre: what is left of a pair is one of the two.
 */
function keepLeft(scene: Group, line: number) {
  const whole = new Box3().setFromObject(scene);
  const cut =
    (whole.min.x + whole.max.x) / 2 + line * (whole.max.x - whole.min.x);
  scene.updateMatrixWorld(true);
  const corner = new Vector3();
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const flat = (object.geometry as BufferGeometry).toNonIndexed();
    const position = flat.getAttribute('position');
    const kept: number[] = [];
    for (let first = 0; first < position.count; first += 3) {
      let x = 0;
      for (let each = 0; each < 3; each++)
        x += corner
          .fromBufferAttribute(position, first + each)
          .applyMatrix4(object.matrixWorld).x;
      if (x / 3 <= cut) kept.push(first, first + 1, first + 2);
    }
    flat.setIndex(kept);
    // Expanding by the index leaves only the kept corners, so the model's
    // size and middle are measured from the one glove.
    object.geometry = flat.toNonIndexed();
  });
}

const props = new Map<string, Promise<Group | undefined>>();

/**
 * Load a small prop (a projectile) once, centred and scaled so its longest
 * side is `size`; undefined when the file is missing or broken.
 */
export function loadProp(name: string, size: number) {
  let prop = props.get(name);
  if (!prop) {
    prop = new Promise<Group | undefined>((resolve) => {
      try {
        new GLTFLoader().load(
          `models/artlist/${name}.glb`,
          (gltf) => {
            try {
              const box = new Box3().setFromObject(gltf.scene);
              const extent = box.getSize(new Vector3());
              const longest = Math.max(extent.x, extent.y, extent.z);
              if (!(longest > 0)) return resolve(undefined);
              gltf.scene.position.sub(box.getCenter(new Vector3()));
              gltf.scene.traverse((object) => {
                if (object instanceof Mesh) object.castShadow = true;
              });
              const held = new Group();
              held.add(gltf.scene);
              held.scale.setScalar(size / longest);
              resolve(held);
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
    props.set(name, prop);
  }
  return prop;
}

/** Start every weapon loading, so the first switch does not pop in late. */
export function preloadWeaponModels() {
  for (const { id } of WEAPONS) void loadWeaponModel(id);
}
