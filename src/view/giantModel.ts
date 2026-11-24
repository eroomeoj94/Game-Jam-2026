import { BufferGeometry, Float32BufferAttribute, Mesh } from 'three';
import type { Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Where each giant's figure is cut into parts, in the model's own units: it
 * stands 1.9 tall, centred on the origin, facing +Z. The figures arrive as
 * one solid piece with their arms hanging, so the arms and legs are cut away
 * by position to let them swing. Lined up by eye for each figure.
 */
export type GiantCut = {
  /** How tall this giant stands, from the floor, in desk units. */
  height: number;
  /** Half the width of the body and head, without the arms. */
  girth: number;
  /** Arms lie outside this distance from the middle... */
  armIn: number;
  /** ...which widens by this much for each unit below `armFlare`. */
  armSplay: number;
  armFlare: number;
  /** Arms run from the shoulder line down to the fingertips. */
  armTop: number;
  armBottom: number;
  /** The shoulder joint: how far out, and how far forward. */
  shoulder: { x: number; y: number };
  /** Legs are everything below this line, inside `legOut`. */
  legTop: number;
  legOut: number;
  /** The hip joint. */
  hip: { x: number; y: number };
};
export const GIANT_CUTS: readonly GiantCut[] = [
  // The stocky lad with the satchel, arms held out from his sides.
  {
    height: 74,
    girth: 0.42,
    armIn: 0.36,
    armSplay: 0.3,
    armFlare: -0.1,
    armTop: 0.12,
    armBottom: -0.68,
    shoulder: { x: 0.42, y: 0.08 },
    legTop: -0.55,
    legOut: 0.33,
    hip: { x: 0.18, y: -0.55 },
  },
  // The old man with the glasses: a big head on a small body.
  {
    height: 66,
    girth: 0.48,
    armIn: 0.17,
    armSplay: 0.35,
    armFlare: -0.1,
    armTop: 0.14,
    armBottom: -0.56,
    shoulder: { x: 0.24, y: 0.1 },
    legTop: -0.44,
    legOut: 0.28,
    hip: { x: 0.17, y: -0.44 },
  },
  // The tall one in the striped shirt, arms close to his sides.
  {
    height: 90,
    girth: 0.33,
    armIn: 0.26,
    armSplay: 0.05,
    armFlare: 0,
    armTop: 0.3,
    armBottom: -0.46,
    shoulder: { x: 0.3, y: 0.26 },
    legTop: -0.32,
    legOut: 0.3,
    hip: { x: 0.15, y: -0.32 },
  },
];
/** Height of the figure in its own units. */
export const GIANT_MODEL_HEIGHT = 1.9;
export const GIANT_PARTS = [
  'body',
  'armRight',
  'armLeft',
  'legRight',
  'legLeft',
] as const;

/** Which part a point of the figure belongs to, as an index of GIANT_PARTS. */
export function giantPart(cut: GiantCut, x: number, y: number) {
  if (y < cut.armTop && y > cut.armBottom) {
    const reach = cut.armIn + cut.armSplay * Math.max(0, cut.armFlare - y);
    // Facing +Z, the figure's right arm is on -X.
    if (x < -reach) return 1;
    if (x > reach) return 2;
  }
  if (y < cut.legTop && Math.abs(x) < cut.legOut) return x < 0 ? 3 : 4;
  return 0;
}

export type GiantModel = {
  map: Texture;
  cut: GiantCut;
  /** The torso and head, with the hip line at the origin. */
  body: BufferGeometry;
  /** Right then left, each with its shoulder at the origin, hanging down -Y. */
  arms: BufferGeometry[];
  /** Right then left, each with its hip joint at the origin. */
  legs: BufferGeometry[];
};

const pending = new Map<number, Promise<GiantModel | undefined>>();

/** Load and cut up one giant's figure; undefined if missing or broken. */
export function loadGiantModel(index: number) {
  const which = index % GIANT_CUTS.length;
  let model = pending.get(which);
  if (!model) {
    model = new Promise<GiantModel | undefined>((resolve) => {
      try {
        new GLTFLoader().load(
          `models/artlist/giant-${which}.glb`,
          (gltf) => {
            try {
              resolve(cutUp(gltf.scene, GIANT_CUTS[which]!));
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
    pending.set(which, model);
  }
  return model;
}

function cutUp(
  scene: { traverse(visit: (object: unknown) => void): void },
  cut: GiantCut,
): GiantModel | undefined {
  let source: Mesh | undefined;
  scene.traverse((object) => {
    if (!source && object instanceof Mesh) source = object;
  });
  if (!source) return undefined;
  const material = Array.isArray(source.material)
    ? source.material[0]
    : source.material;
  const map = (material as { map?: Texture | null } | undefined)?.map;
  if (!map) return undefined;
  const flat = source.geometry.toNonIndexed();
  const position = flat.getAttribute('position');
  const normal = flat.getAttribute('normal');
  const uv = flat.getAttribute('uv');
  if (!position || !uv) return undefined;
  // Each part is moved so that its joint sits at the origin.
  const joints = [
    { x: 0, y: cut.hip.y },
    { x: -cut.shoulder.x, y: cut.shoulder.y },
    { x: cut.shoulder.x, y: cut.shoulder.y },
    { x: -cut.hip.x, y: cut.hip.y },
    { x: cut.hip.x, y: cut.hip.y },
  ];
  const parts = GIANT_PARTS.map(() => ({
    position: [] as number[],
    normal: [] as number[],
    uv: [] as number[],
  }));
  for (let first = 0; first < position.count; first += 3) {
    // A triangle goes wherever its middle is, so no face is torn in two.
    let x = 0;
    let y = 0;
    for (let each = 0; each < 3; each++) {
      x += position.getX(first + each) / 3;
      y += position.getY(first + each) / 3;
    }
    const kind = giantPart(cut, x, y);
    const part = parts[kind]!;
    const joint = joints[kind]!;
    for (let each = 0; each < 3; each++) {
      const corner = first + each;
      part.position.push(
        position.getX(corner) - joint.x,
        position.getY(corner) - joint.y,
        position.getZ(corner),
      );
      if (normal)
        part.normal.push(
          normal.getX(corner),
          normal.getY(corner),
          normal.getZ(corner),
        );
      part.uv.push(uv.getX(corner), uv.getY(corner));
    }
  }
  const built = parts.map((part) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(part.position, 3),
    );
    if (part.normal.length)
      geometry.setAttribute(
        'normal',
        new Float32BufferAttribute(part.normal, 3),
      );
    else geometry.computeVertexNormals();
    geometry.setAttribute('uv', new Float32BufferAttribute(part.uv, 2));
    return geometry;
  });
  return {
    map,
    cut,
    body: built[0]!,
    arms: [built[1]!, built[2]!],
    legs: [built[3]!, built[4]!],
  };
}
