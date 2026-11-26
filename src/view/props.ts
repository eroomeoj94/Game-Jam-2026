import { Box3, Group, Mesh, Vector3 } from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * The generated scenery models: where each lives and how it is fitted into
 * the simple shape the physics uses for it.
 *
 * - `box`: stretched to fill the shape exactly.
 * - `round`: sized by its depth, so a handle or spout along x sticks out
 *   past the shape instead of shrinking the body; `stick` says which side.
 * - `footprint`: sized by its base and stood on the bottom of the shape,
 *   with whatever is taller (pencils in a pot) left poking out of the top.
 */
type Fit = {
  file: string;
  fit: 'box' | 'round' | 'footprint';
  /** Turn the model before measuring it, for ones that arrived on their side. */
  turn?: [number, number, number];
  stick?: 'left' | 'right';
};
export const PROPS = {
  mug: { file: 'mug', fit: 'round', stick: 'right' },
  pot: { file: 'pot', fit: 'footprint' },
  spool: { file: 'spool', fit: 'box' },
  tin: { file: 'tin', fit: 'round' },
  box: { file: 'box', fit: 'box' },
  pad: { file: 'pad', fit: 'box' },
  openbook: { file: 'book', fit: 'box' },
  toaster: { file: 'toaster', fit: 'box' },
  // It arrived standing on its edge.
  board: { file: 'board', fit: 'box', turn: [-Math.PI / 2, 0, 0] },
  loaf: { file: 'loaf', fit: 'box' },
  carton: { file: 'cereal', fit: 'box' },
  butter: { file: 'butter', fit: 'box' },
  kettle: { file: 'kettle', fit: 'round', stick: 'left' },
  pan: { file: 'pan', fit: 'round', stick: 'right' },
  plates: { file: 'plates', fit: 'footprint' },
  jam: { file: 'jam', fit: 'round' },
  mill: { file: 'mill', fit: 'round' },
  milk: { file: 'milk', fit: 'round' },
  apple: { file: 'apple', fit: 'round' },
  fan: { file: 'fan', fit: 'footprint' },
  car: { file: 'car', fit: 'box' },
  mouse: { file: 'mouse', fit: 'box' },
  pin: { file: 'pin', fit: 'box' },
} satisfies Record<string, Fit>;
export type PropName = keyof typeof PROPS;
export const isProp = (name: string): name is PropName => name in PROPS;

export const propUrl = (name: PropName) =>
  `models/props/${(PROPS[name] as Fit).file}.glb`;

const pending = new Map<string, Promise<Group | undefined>>();
/** Load a model once; undefined when the file is missing or broken. */
function load(name: PropName) {
  const url = propUrl(name);
  let loading = pending.get(url);
  if (!loading) {
    loading = new Promise<Group | undefined>((resolve) => {
      try {
        new GLTFLoader().load(
          url,
          (gltf) => resolve(gltf.scene),
          undefined,
          () => resolve(undefined),
        );
      } catch {
        resolve(undefined);
      }
    });
    pending.set(url, loading);
  }
  return loading;
}

/** The space a prop is fitted into: full sizes, centred on the origin. */
export type Bounds = { width: number; height: number; depth: number };

/**
 * A copy of the model, scaled and placed so it fills `bounds` about the
 * origin in the way its `fit` describes. Undefined when it cannot be loaded.
 */
export async function fitProp(name: PropName, bounds: Bounds) {
  const source = await load(name);
  if (!source) return undefined;
  const style: Fit = PROPS[name];
  const model = source.clone(true);
  if (style.turn) model.rotation.set(...style.turn);
  const holder = new Group();
  holder.add(model);
  holder.updateMatrixWorld(true);
  const box = new Box3().setFromObject(holder);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  if ([size.x, size.y, size.z].some((side) => !(side > 1e-6))) return undefined;
  if (style.fit === 'box') {
    holder.scale.set(
      bounds.width / size.x,
      bounds.height / size.y,
      bounds.depth / size.z,
    );
  } else if (style.fit === 'round') {
    const across = bounds.depth / size.z;
    holder.scale.set(across, bounds.height / size.y, across);
    // The body is as wide as it is deep; the rest is handle or spout.
    if (style.stick === 'right') centre.x = box.min.x + size.z / 2;
    if (style.stick === 'left') centre.x = box.max.x - size.z / 2;
  } else {
    const scale = Math.min(bounds.width / size.x, bounds.depth / size.z);
    holder.scale.setScalar(scale);
    // Stand it on the bottom of the shape.
    centre.y = box.min.y + bounds.height / 2 / scale;
  }
  model.position.sub(centre);
  holder.traverse((part: Object3D) => {
    if (part instanceof Mesh) part.castShadow = part.receiveShadow = true;
  });
  return holder;
}
