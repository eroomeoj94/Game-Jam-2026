import { BufferAttribute, BufferGeometry, Mesh, type Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * The wooden moth figure, generated with Artlist and loaded from
 * `public/models/artlist/moth.glb` when the file is there. It arrives as one
 * solid mesh, so the wings are cut away from the body here: they are the
 * parts painted blue-grey rather than wood, hanging behind the back. Each
 * wing can then swing on a hinge down the spine.
 */
export const MOTH_MODEL_URL = 'models/artlist/moth.glb';

type Joint = { x: number; y: number; z: number };
export type MothModel = {
  body: BufferGeometry;
  /** Left (x < 0) then right, each with the hinge at its origin. */
  wings: [BufferGeometry, BufferGeometry];
  /** Where the hinges sit, in the model's own space after scaling. */
  hinge: { y: number; z: number };
  /** Arms and legs, left then right, each with its joint at the origin. */
  arms: [BufferGeometry, BufferGeometry];
  legs: [BufferGeometry, BufferGeometry];
  /** Shoulder and hip positions after scaling, left then right. */
  shoulders: [Joint, Joint];
  hips: [Joint, Joint];
  map: Texture;
};

/** Height the figure is scaled to, and how far its feet sit below centre. */
const HEIGHT = 1.5;
const FEET = -0.48;
/** Beyond this distance from the spine everything is wing. */
const BODY_REACH = 0.345;
/** Wings hang at least this far behind the model's centre. */
const WING_DEPTH = -0.06;

/** True for a texel of the wooden body rather than the painted wings. */
export function isWood(red: number, _green: number, blue: number) {
  return red > blue + 25;
}

/**
 * Where the figure's limbs are, in the model's original coordinates, read off
 * a front-view silhouette of the mesh. The figure stands slightly off centre,
 * so the two sides differ.
 */
const LIMBS = {
  /** Arms hang outside these lines, between the hands and the shoulders. */
  armLeft: -0.17,
  armRight: 0.195,
  armBottom: -0.56,
  armTop: 0.07,
  /** Legs are everything below the hips, split down the middle of the gap. */
  legTop: -0.5,
  legSplit: 0.03,
  shoulders: [
    { x: -0.2, y: 0.04, z: -0.03 },
    { x: 0.215, y: 0.04, z: -0.03 },
  ],
  hips: [
    { x: -0.09, y: -0.5, z: 0 },
    { x: 0.15, y: -0.5, z: 0 },
  ],
} as const;

/** The parts a triangle can belong to, in the order `classifyTriangle` uses. */
export const PARTS = [
  'body',
  'wingLeft',
  'wingRight',
  'armLeft',
  'armRight',
  'legLeft',
  'legRight',
] as const;

/**
 * Sort a triangle into one of PARTS (by index) from its corners, in the
 * model's original coordinates, and whether each corner is painted as wood.
 * Wings are picked out first, then arms, then legs; the rest is the body.
 */
export function classifyTriangle(
  corners: readonly { x: number; y: number; z: number; wood: boolean }[],
) {
  const mean = (
    pick: (corner: { x: number; y: number; z: number }) => number,
  ) => corners.reduce((sum, corner) => sum + pick(corner), 0) / corners.length;
  const x = mean((corner) => corner.x);
  const y = mean((corner) => corner.y);
  const z = mean((corner) => corner.z);
  const painted = corners.filter((corner) => !corner.wood).length;
  const wing =
    Math.abs(x) > BODY_REACH ||
    (painted * 2 > corners.length && z < WING_DEPTH);
  if (wing) return x < 0 ? 1 : 2;
  if (y > LIMBS.armBottom && y < LIMBS.armTop) {
    if (x < LIMBS.armLeft) return 3;
    if (x > LIMBS.armRight) return 4;
  }
  if (y < LIMBS.legTop) return x < LIMBS.legSplit ? 5 : 6;
  return 0;
}

/**
 * Cut a hanging limb in two at height `y` (in the limb's own space, joint at
 * the origin), so the lower half can bend. Returns the upper half, the lower
 * half with the new joint at its origin, and where that joint is.
 */
export function splitLimb(geometry: BufferGeometry, y: number) {
  const names = ['position', 'normal', 'uv'] as const;
  const position = geometry.getAttribute('position');
  // The joint sits in the middle of the limb where it is cut.
  const joint = { x: 0, y, z: 0 };
  let near = 0;
  for (let index = 0; index < position.count; index++)
    if (Math.abs(position.getY(index) - y) < 0.04) {
      joint.x += position.getX(index);
      joint.z += position.getZ(index);
      near++;
    }
  if (near) {
    joint.x /= near;
    joint.z /= near;
  }
  const halves = [0, 1].map(() => ({
    position: [] as number[],
    normal: [] as number[],
    uv: [] as number[],
  }));
  for (let corner = 0; corner + 2 < position.count; corner += 3) {
    const height =
      (position.getY(corner) +
        position.getY(corner + 1) +
        position.getY(corner + 2)) /
      3;
    const lower = height < y;
    const half = halves[lower ? 1 : 0]!;
    for (let index = corner; index < corner + 3; index++)
      for (const name of names) {
        const attribute = geometry.getAttribute(name);
        if (!attribute) continue;
        for (let item = 0; item < attribute.itemSize; item++) {
          let value = attribute.getComponent(index, item);
          if (lower && name === 'position')
            value -= [joint.x, joint.y, joint.z][item]!;
          half[name].push(value);
        }
      }
  }
  const [upper, lower] = halves.map((half) => {
    const part = new BufferGeometry();
    for (const name of names)
      if (half[name].length)
        part.setAttribute(
          name,
          new BufferAttribute(
            new Float32Array(half[name]),
            name === 'uv' ? 2 : 3,
          ),
        );
    return part;
  });
  return { upper: upper!, lower: lower!, joint };
}

let pending: Promise<MothModel | undefined> | undefined;

/** Load and cut up the model once; undefined when it is missing or broken. */
export function loadMothModel(url = MOTH_MODEL_URL) {
  pending ??= new Promise<MothModel | undefined>((resolve) => {
    try {
      new GLTFLoader().load(
        url,
        (gltf) => {
          try {
            resolve(cutUp(gltf.scene));
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
  return pending;
}

function cutUp(scene: { traverse(visit: (object: unknown) => void): void }) {
  let source: Mesh | undefined;
  scene.traverse((object) => {
    if (!source && object instanceof Mesh) source = object;
  });
  if (!source) return undefined;
  const material = Array.isArray(source.material)
    ? source.material[0]
    : source.material;
  const map = (material as { map?: Texture | null } | undefined)?.map;
  const image = map?.image as CanvasImageSource | undefined;
  if (!map || !image) return undefined;
  // Read the texture back so each corner can be told apart by its paint.
  const width = (image as { width: number }).width;
  const height = (image as { height: number }).height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return undefined;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, width, height).data;
  const flat = source.geometry.toNonIndexed();
  const position = flat.getAttribute('position');
  const normal = flat.getAttribute('normal');
  const uv = flat.getAttribute('uv');
  if (!position || !uv) return undefined;
  flat.computeBoundingBox();
  const box = flat.boundingBox!;
  const scale = HEIGHT / Math.max(box.max.y - box.min.y, 1e-6);
  const lift = FEET - box.min.y * scale;
  const parts = PARTS.map(() => ({
    position: [] as number[],
    normal: [] as number[],
    uv: [] as number[],
  }));
  // Find the wings first, to learn where their hinge is.
  const kinds: number[] = [];
  let hingeZ = 0;
  let hingeCount = 0;
  for (let corner = 0; corner < position.count; corner += 3) {
    const corners = [0, 1, 2].map((offset) => {
      const index = corner + offset;
      const u = Math.min(
        width - 1,
        Math.max(0, Math.floor(uv.getX(index) * width)),
      );
      const v = Math.min(
        height - 1,
        Math.max(0, Math.floor(uv.getY(index) * height)),
      );
      const at = (v * width + u) * 4;
      return {
        x: position.getX(index),
        y: position.getY(index),
        z: position.getZ(index),
        wood: isWood(pixels[at]!, pixels[at + 1]!, pixels[at + 2]!),
      };
    });
    const kind = classifyTriangle(corners);
    kinds.push(kind);
    if (kind !== 1 && kind !== 2) continue;
    for (const { x, z } of corners)
      if (Math.abs(x) < 0.12) {
        hingeZ += z;
        hingeCount++;
      }
  }
  const hinge = {
    y: lift,
    z: (hingeCount ? hingeZ / hingeCount : -0.14) * scale,
  };
  const joint = ({ x, y, z }: Joint): Joint => ({
    x: x * scale,
    y: y * scale + lift,
    z: z * scale,
  });
  const shoulders = LIMBS.shoulders.map(joint) as [Joint, Joint];
  const hips = LIMBS.hips.map(joint) as [Joint, Joint];
  /** Each part's own origin: the body's is the model's, a limb's is its joint. */
  const origins: Joint[] = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: hinge.y, z: hinge.z },
    { x: 0, y: hinge.y, z: hinge.z },
    ...shoulders,
    ...hips,
  ];
  kinds.forEach((kind, triangle) => {
    const part = parts[kind]!;
    for (let offset = 0; offset < 3; offset++) {
      const index = triangle * 3 + offset;
      const x = position.getX(index) * scale;
      const y = position.getY(index) * scale + lift;
      const z = position.getZ(index) * scale;
      // Wings and limbs are stored relative to their hinge or joint.
      const origin = origins[kind]!;
      part.position.push(x - origin.x, y - origin.y, z - origin.z);
      if (normal)
        part.normal.push(
          normal.getX(index),
          normal.getY(index),
          normal.getZ(index),
        );
      part.uv.push(uv.getX(index), uv.getY(index));
    }
  });
  const [body, left, right, armLeft, armRight, legLeft, legRight] = parts.map(
    (part) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new BufferAttribute(new Float32Array(part.position), 3),
      );
      if (part.normal.length)
        geometry.setAttribute(
          'normal',
          new BufferAttribute(new Float32Array(part.normal), 3),
        );
      else geometry.computeVertexNormals();
      geometry.setAttribute(
        'uv',
        new BufferAttribute(new Float32Array(part.uv), 2),
      );
      return geometry;
    },
  );
  if (
    !body ||
    !left ||
    !right ||
    !armLeft ||
    !armRight ||
    !legLeft ||
    !legRight
  )
    return undefined;
  // A model with no wings to cut off is not the one this was written for.
  if (
    !left.getAttribute('position').count ||
    !right.getAttribute('position').count
  )
    return undefined;
  return {
    body,
    wings: [left, right],
    hinge,
    arms: [armLeft, armRight],
    legs: [legLeft, legRight],
    shoulders,
    hips,
    map,
  } satisfies MothModel;
}
