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

export type MothModel = {
  body: BufferGeometry;
  /** Left (x < 0) then right, each with the hinge at its origin. */
  wings: [BufferGeometry, BufferGeometry];
  /** Where the hinges sit, in the model's own space after scaling. */
  hinge: { y: number; z: number };
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
 * Sort a triangle into the body (0), the left wing (1) or the right wing (2)
 * from its corners, in the model's original coordinates, and whether each
 * corner is painted as wood.
 */
export function classifyTriangle(
  corners: readonly { x: number; z: number; wood: boolean }[],
) {
  const x = corners.reduce((sum, corner) => sum + corner.x, 0) / corners.length;
  const z = corners.reduce((sum, corner) => sum + corner.z, 0) / corners.length;
  const painted = corners.filter((corner) => !corner.wood).length;
  const wing =
    Math.abs(x) > BODY_REACH ||
    (painted * 2 > corners.length && z < WING_DEPTH);
  if (!wing) return 0;
  return x < 0 ? 1 : 2;
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
  const parts = [0, 1, 2].map(() => ({
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
        z: position.getZ(index),
        wood: isWood(pixels[at]!, pixels[at + 1]!, pixels[at + 2]!),
      };
    });
    const kind = classifyTriangle(corners);
    kinds.push(kind);
    if (kind === 0) continue;
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
  kinds.forEach((kind, triangle) => {
    const part = parts[kind]!;
    for (let offset = 0; offset < 3; offset++) {
      const index = triangle * 3 + offset;
      const x = position.getX(index) * scale;
      const y = position.getY(index) * scale + lift;
      const z = position.getZ(index) * scale;
      // Wings are stored relative to their hinge.
      if (kind === 0) part.position.push(x, y, z);
      else part.position.push(x, y - hinge.y, z - hinge.z);
      if (normal)
        part.normal.push(
          normal.getX(index),
          normal.getY(index),
          normal.getZ(index),
        );
      part.uv.push(uv.getX(index), uv.getY(index));
    }
  });
  const [body, left, right] = parts.map((part) => {
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
  });
  if (!body || !left || !right) return undefined;
  // A model with no wings to cut off is not the one this was written for.
  if (
    !left.getAttribute('position').count ||
    !right.getAttribute('position').count
  )
    return undefined;
  return { body, wings: [left, right], hinge, map } satisfies MothModel;
}
