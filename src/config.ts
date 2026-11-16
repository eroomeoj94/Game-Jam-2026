type Piece = { x: number; y: number; z: number; color: number };
export type BoxPiece = Piece & {
  shape: 'box';
  kind: 'desk' | 'books' | 'laptop' | 'box' | 'pad';
  width: number;
  height: number;
  depth: number;
  levels?: number;
};
export type CylinderPiece = Piece & {
  shape: 'cylinder';
  kind: 'mug' | 'pot' | 'spool' | 'tin';
  radius: number;
  height: number;
};
export type TerrainPiece = BoxPiece | CylinderPiece;

const DESK = { width: 56, depth: 30 } as const;

function books(
  x: number,
  z: number,
  width: number,
  depth: number,
  levels: number,
  color: number,
  levelHeight = 0.4,
): BoxPiece {
  const height = levels * levelHeight;
  return {
    kind: 'books',
    shape: 'box',
    x,
    y: height / 2,
    z,
    width,
    height,
    depth,
    levels,
    color,
  };
}
function block(
  kind: BoxPiece['kind'],
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  color: number,
): BoxPiece {
  return {
    kind,
    shape: 'box',
    x,
    y: height / 2,
    z,
    width,
    height,
    depth,
    color,
  };
}
function round(
  kind: CylinderPiece['kind'],
  x: number,
  z: number,
  radius: number,
  height: number,
  color: number,
): CylinderPiece {
  return {
    kind,
    shape: 'cylinder',
    x,
    y: height / 2,
    z,
    radius,
    height,
    color,
  };
}

// Each team starts at its own end of the desk, beside a low book perch.
const BASE_A = { x: -22, z: 6 } as const;
const BASE_B = { x: 22, z: 6 } as const;

export const ARENA = {
  lampRadius: 0.32,
  mothRadius: 0.48,
  desk: DESK,
  /** Order matters: the desk first, then each team's nearby book perch. */
  terrain: [
    {
      kind: 'desk',
      shape: 'box',
      x: 0,
      y: -0.25,
      z: 0,
      width: DESK.width,
      height: 0.5,
      depth: DESK.depth,
      color: 0x79523b,
    },
    books(BASE_A.x + 0.9, BASE_A.z - 2.1, 2.5, 2, 2, 0x995845),
    books(BASE_B.x - 0.9, BASE_B.z - 2.25, 2.2, 2.4, 3, 0x526e6d),

    // Team bases: a pencil case wall behind each perch.
    block('box', BASE_A.x - 1, BASE_A.z - 7, 5, 0.8, 1.6, 0x3f5d87),
    block('box', BASE_B.x + 1, BASE_B.z - 7, 5, 0.8, 1.6, 0xa04f43),

    // Centre lamp: a ring of perches inside the halo.
    books(-3.2, -2.6, 2.6, 2.2, 2, 0x6c5a86),
    books(3.4, 2.4, 2.4, 2.2, 3, 0x8a7a3e),
    block('pad', 0.4, 4.4, 1.4, 0.28, 1.4, 0xe0c65a),
    block('box', -4, 2.6, 1.9, 1, 1.2, 0xb04a3a),
    round('spool', 3.2, -3, 0.5, 0.75, 0x9f6051),
    // A wide notebook behind the centre makes a raised stage.
    block('pad', 0, -10, 7, 0.3, 5, 0x4a6b5a),

    // Left lamp: the tall tower and its steps.
    books(-15, -6, 3, 2.4, 4, 0x6c5a86, 0.55),
    books(-12, -5.6, 1.8, 2.2, 2, 0x8a7a3e, 0.55),
    round('tin', -16.5, 1.5, 1.1, 0.5, 0x7d8e6a),
    block('pad', -11.5, 1.5, 1.1, 0.36, 0.6, 0xd98a96),
    block('box', -14, 5, 1.9, 1, 1.2, 0x5a7f4f),

    // Right lamp: a closed laptop, mug and pencil pot.
    block('laptop', 14, -6.5, 5, 0.35, 3.4, 0x3b3f45),
    round('mug', 18, 1, 0.9, 1.9, 0xa37a58),
    round('pot', 10.5, -2, 0.85, 2, 0x4f6f8a),
    round('spool', 12, 3, 0.5, 0.75, 0xc9b37a),
    books(16.5, -1.5, 2.2, 2, 2, 0x995845),

    // Back corners and front edge: cover and detours between lamps.
    round('pot', -25, -12, 0.85, 2, 0x4f6f8a),
    round('mug', 25, -11, 0.9, 1.9, 0x6e8a7a),
    books(-7, -11, 3, 2.4, 3, 0x526e6d),
    books(8, -11.5, 2.6, 2.2, 2, 0xb04a3a),
    block('box', -6, 10, 1.9, 1, 1.2, 0xb04a3a),
    round('tin', 7, 10.5, 1.1, 0.5, 0x7d8e6a),
    block('pad', -17, 11, 1.4, 0.28, 1.4, 0xe0c65a),
    block('pad', 17, 11.5, 1.1, 0.36, 0.6, 0xd98a96),
  ] satisfies TerrainPiece[] as TerrainPiece[],
  spawns: [
    { name: 'Dusty', x: BASE_A.x, y: 0.5, z: BASE_A.z, color: 0xc89743 },
    { name: 'Mothhew', x: BASE_B.x, y: 0.5, z: BASE_B.z, color: 0x599e98 },
  ],
} as const;

export const MAX_LAMPS = 4;

/**
 * Hanging lamps. Each one scores its own area of the desk. Count, height,
 * tether and positions rebuild the scene; the halo radius applies live.
 */
export const LAMPS = {
  count: 3,
  anchorHeight: 9,
  tetherLength: 4,
  /** Lit radius on the desk is about 4.9 with the lamp hanging at rest. */
  haloRadius: 7,
  positions: [
    { x: 0, z: 0 },
    { x: -14, z: -2 },
    { x: 14, z: -2 },
    { x: 0, z: 9 },
  ],
};

export const LIGHTING = {
  lampIntensity: 280,
  lampAngle: 1.25,
  ambient: 1.15,
  moon: 160,
  exposure: 1.2,
  fog: 0.006,
};

/** Miniature-style blur above and below a sharp band of focus. */
export const TILT_SHIFT = {
  enabled: true,
  /** Blur step in pixels at the top and bottom of the frame. */
  strength: 3,
  /** Half-height of the sharp band, as a fraction of the screen. */
  band: 0.08,
  /** Keep the active moth in focus; otherwise use `focus` below. */
  followMoth: true,
  /** Focus line from 0 (bottom) to 1 (top) when not following a moth. */
  focus: 0.45,
  saturation: 1.15,
};

export const MAX_FUR_LAYERS = 32;

/** Shell-textured fur on the moths' bodies and heads. */
export const FUR = {
  /** Number of shells; more is smoother and costs more to draw. */
  layers: 16,
  /** Fur length in world units. */
  length: 0.05,
  /** Strands per unit of texture height. */
  density: 40,
  /** Strand width at the root, as a fraction of its cell. */
  thickness: 0.9,
  /** How much the tips sag under gravity. */
  droop: 0.35,
  /** How much darker the roots are than the tips. */
  rootShade: 0.45,
};

export const PHYSICS_STEP_MS = 1000 / 60;
export const MAX_FRAME_MS = 100;

// Movement, camera and lighting are deliberately mutable: the tuning panel
// edits them while the game runs.
export const MOVEMENT = {
  speed: 5,
  groundAcceleration: 40,
  airAcceleration: 12,
  jumpSpeed: 5.8,
  flutterSeconds: 0.9,
  flutterAcceleration: 16,
  maxFlutterRiseSpeed: 4.5,
  fallHeight: -2.5,
  respawnDelay: 0.6,
};

export const CAMERA = {
  /** Distance behind the moth when the shoulder camera snaps into place. */
  followDistance: 5.5,
  followRise: 2.2,
  followHeight: 0.55,
  followMinDistance: 2,
  followMaxDistance: 22,
  /** Fraction of the screen width the view is shifted to frame the shoulder. */
  shoulderOffset: 0.12,
  followEase: 10,
  wallLimitZ: -16,
  /** Flip camera look direction for the right stick and mouse drag. */
  invertX: true,
  invertY: true,
  stickSpeed: 1.5,
  fov: 42,
};
