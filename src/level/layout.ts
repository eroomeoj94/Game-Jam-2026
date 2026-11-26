/**
 * The levels: what stands on the surface, where the lamps hang, what moves
 * and where the holes are. Nothing here depends on the page's setup, so a
 * level can be built and checked on its own.
 */

type Piece = { x: number; y: number; z: number; color: number };
export type BoxPiece = Piece & {
  shape: 'box';
  kind:
    | 'desk'
    | 'books'
    | 'laptop'
    | 'box'
    | 'pad'
    | 'openbook'
    | 'ruler'
    | 'eraser'
    | 'toaster'
    | 'board'
    | 'loaf'
    | 'carton'
    | 'butter';
  width: number;
  height: number;
  depth: number;
  levels?: number;
};
export type CylinderPiece = Piece & {
  shape: 'cylinder';
  kind:
    | 'mug'
    | 'pot'
    | 'spool'
    | 'tin'
    | 'kettle'
    | 'pan'
    | 'plates'
    | 'jam'
    | 'mill'
    | 'milk'
    | 'apple'
    | 'fan';
  radius: number;
  height: number;
};
export type TerrainPiece = BoxPiece | CylinderPiece;

export type LevelId = 'desk' | 'kitchen';
export const LEVELS: readonly { id: LevelId; name: string }[] = [
  { id: 'desk', name: 'Desk' },
  { id: 'kitchen', name: 'Kitchen' },
];

/** A hole in the surface: anything that drops into it is gone. */
export type Pit = { x: number; z: number; width: number; depth: number };

type Spot = { x: number; z: number };
/** Things on the surface that move, or react to being hit. */
export type GadgetSpec =
  /** Blows moths along its stream: a desk fan, or a kettle letting off steam. */
  | (Spot & {
      type: 'blower';
      kind: 'fan' | 'kettle';
      radius: number;
      height: number;
      /** Which way it blows, as a heading like a moth's. */
      heading: number;
      /** How far it swings either side of that, and how long a swing takes. */
      sweep: number;
      sweepSeconds: number;
      /** Seconds from one blast to the next, and the fraction spent blowing. */
      period: number;
      duty: number;
      range: number;
      halfAngle: number;
      /** Push at the mouth, as an acceleration. */
      force: number;
    })
  /** Throws whoever is standing on it: a toaster popping, or a see-saw. */
  | (Spot & {
      type: 'launcher';
      kind: 'toaster' | 'seesaw';
      heading: number;
      /** Across, up, and along the heading. */
      width: number;
      height: number;
      depth: number;
      /** Seconds between pops; 0 for a see-saw, which waits to be landed on. */
      period: number;
      /** Upward speed it gives. */
      power: number;
    })
  /** Drives round a loop, shoving moths out of its way. */
  | {
      type: 'runner';
      kind: 'car' | 'mouse';
      path: Spot[];
      speed: number;
      length: number;
      width: number;
      height: number;
      push: number;
    }
  /** Lies loose and rolls when shoved: a pencil or a rolling pin. */
  | (Spot & {
      type: 'roller';
      kind: 'pencil' | 'pin';
      heading: number;
      length: number;
      radius: number;
    })
  /** Stands until hit, then tips over and leaves a slippery puddle. */
  | (Spot & {
      type: 'spill';
      kind: 'mug' | 'milk';
      radius: number;
      height: number;
      /** How far the puddle spreads, and its colour. */
      puddle: number;
      color: number;
    })
  /** A stack that comes down when hit. */
  | (Spot & {
      type: 'topple';
      kind: 'books' | 'plates';
      width: number;
      depth: number;
      levels: number;
      levelHeight: number;
      color: number;
    });

/** Shrinks or grows the surface and everything laid out on it. */
export const BOARD_SCALE = 0.24;
export const DESK = {
  width: 250 * BOARD_SCALE,
  depth: 134 * BOARD_SCALE,
} as const;
const scaled = <T extends { x: number; z: number }>(spot: T) => ({
  x: spot.x * BOARD_SCALE,
  z: spot.z * BOARD_SCALE,
});

function books(
  x: number,
  z: number,
  width: number,
  depth: number,
  levels: number,
  color: number,
  levelHeight = 0.4,
  /** Height of whatever the stack stands on; 0 is the surface. */
  base = 0,
): BoxPiece {
  const height = levels * levelHeight;
  return {
    kind: 'books',
    shape: 'box',
    x,
    y: base + height / 2,
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
  base = 0,
): BoxPiece {
  return {
    kind,
    shape: 'box',
    x,
    y: base + height / 2,
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
  base = 0,
): CylinderPiece {
  return {
    kind,
    shape: 'cylinder',
    x,
    y: base + height / 2,
    z,
    radius,
    height,
    color,
  };
}

/**
 * Fixed start slots at each end of the surface, beside a low book perch. The
 * game drops moths in at random; tests and the respawn fallback use these.
 */
export const START_A = scaled({ x: -110, z: 0 });
export const START_B = scaled({ x: 110, z: 0 });
// The third and fourth teams start in the middle, towards the front and back.
export const START_C = { x: START_A.x * 0.35, z: DESK.depth * 0.3 };
export const START_D = { x: START_B.x * 0.35, z: -DESK.depth * 0.3 };

/** Height of the first tier above the surface; the summit is twice this. */
const TIER = 3.4;
/**
 * Where the lamps hang, in three tiers. Three hang low, each with a cluster
 * of perches beneath it. Two hang over the box lids in the back corners, a
 * flutter up, and one over the summit of the tower between them. `base` is
 * the height of the surface a lamp lights: the giants cannot reach the high
 * ones, but their platforms are small and jut out over the back, so a shove
 * can send a moth off for good.
 */
export const LAMP_SPOTS = [
  { x: 0, z: 4, base: 0 },
  { x: -14, z: 6, base: 0 },
  { x: 14, z: 6, base: 0 },
  { x: -24.5, z: -13.2, base: TIER },
  { x: 24.5, z: -13.2, base: TIER },
  { x: 0, z: -12.6, base: TIER * 2 },
];

/**
 * A lane across the middle, between the low lamps and the tiers, kept clear
 * of clutter for whatever drives round it.
 */
const LANE = { near: -3.3, far: -5.1, reach: 21, turn: 0.9 };
/** The loop a runner drives: two straights joined by a half turn each end. */
function lap(): Spot[] {
  const middle = (LANE.near + LANE.far) / 2;
  const points: Spot[] = [];
  // Along the far straight to the right-hand end, round, and back along the
  // near one to the left-hand end.
  for (const [centre, from] of [
    [LANE.reach, -Math.PI / 2],
    [-LANE.reach, Math.PI / 2],
  ] as const)
    for (let step = 0; step <= 6; step++) {
      const angle = from + (step / 6) * Math.PI;
      points.push({
        x: centre + Math.cos(angle) * LANE.turn,
        z: middle + Math.sin(angle) * LANE.turn,
      });
    }
  return points;
}
const inLane = (x: number, z: number, margin = 1.6) =>
  z < LANE.near + margin &&
  z > LANE.far - margin &&
  Math.abs(x) < LANE.reach + LANE.turn + margin;

/** A seeded source of numbers from 0 to 1: the same seed, the same level. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Cluster = (
  x: number,
  z: number,
  /** True when the level has gadgets: the cluster's own come to life. */
  lively: boolean,
) => { pieces: TerrainPiece[]; gadgets: GadgetSpec[] };

/** A box lid in a back corner with steps up to it; `side` mirrors it. */
const corner = (side: 1 | -1, kitchen = false): TerrainPiece[] => [
  block('box', side * 24.5, -13.2, 10, TIER, 8, 0xb08d62),
  ...(kitchen
    ? [
        round('plates', side * 17.9, -7.6, 1.5, 1.2, 0xf2f2f2),
        round('tin', side * 21.2, -7.6, 1.5, 2.4, 0x7d8e6a),
        round('apple', side * 27.6, -10.8, 0.6, 1.1, 0xc0392b, TIER),
        block('butter', side * 21.4, -15.6, 2, 0.5, 1.3, 0xf2e6a0, TIER),
      ]
    : [
        books(side * 17.9, -7.6, 3, 3, 2, 0x8a7a3e, 0.6),
        books(side * 21.2, -7.6, 3, 3, 4, 0x6c5a86, 0.6),
        round('spool', side * 27.6, -10.8, 0.5, 0.75, 0x9f6051, TIER),
        block('pad', side * 21.4, -15.6, 1.4, 0.28, 1.4, 0xe0c65a, TIER),
      ]),
];
/** The tower at the back: a wide base, then a narrow summit. */
const summit = (kitchen = false): TerrainPiece[] => [
  kitchen
    ? block('box', 0, -12, 11, TIER, 9, 0xb08d62)
    : books(0, -12, 11, 9, 6, 0x3f5d87, TIER / 6),
  kitchen
    ? block('box', 0, -12.6, 6.4, TIER, 6, 0xb08d62, TIER)
    : books(0, -12.6, 6.4, 6, 6, 0x995845, TIER / 6, TIER),
  // Steps up either side of the base.
  ...([1, -1] as const).flatMap((side) => [
    books(side * 8.6, -8.6, 3, 3, 2, 0x526e6d, 0.6),
    books(side * 7.2, -12, 3, 3.2, 4, 0x8a7a3e, 0.6),
  ]),
  // Something on the base shortens the flutter to the summit.
  kitchen
    ? block('loaf', 3.8, -8.6, 2.4, 1.7, 1.5, 0xc98a4b, TIER)
    : block('box', 3.8, -8.6, 2, 1.5, 1.6, 0xb04a3a, TIER),
  round('tin', -3.8, -8.7, 1.1, 0.5, 0x7d8e6a, TIER),
];

/** A ring of low perches inside a lamp's light. */
const ring: Cluster = (x, z) => ({
  pieces: [
    books(x - 3.2, z - 2.6, 2.6, 2.2, 2, 0x6c5a86),
    books(x + 3.4, z + 2.4, 2.4, 2.2, 3, 0x8a7a3e),
    block('pad', x + 0.4, z + 4.4, 1.4, 0.28, 1.4, 0xe0c65a),
    block('box', x - 4, z + 2.6, 1.9, 1, 1.2, 0xb04a3a),
    round('spool', x + 3.2, z - 3, 0.5, 0.75, 0x9f6051),
  ],
  gadgets: [],
});
/** A tall book tower with steps up to it: the tower comes down when hit. */
const tower: Cluster = (x, z, lively) => ({
  pieces: [
    ...(lively ? [] : [books(x - 1, z - 4, 3, 2.4, 4, 0x6c5a86, 0.55)]),
    books(x + 2, z - 3.6, 1.8, 2.2, 2, 0x8a7a3e, 0.55),
    round('tin', x - 2.5, z + 3.5, 1.1, 0.5, 0x7d8e6a),
    block('pad', x + 2.5, z + 3.5, 1.1, 0.36, 0.6, 0xd98a96),
    block('box', x + 4.5, z + 0.5, 1.9, 1, 1.2, 0x5a7f4f),
  ],
  gadgets: lively
    ? [
        {
          type: 'topple',
          kind: 'books',
          x: x - 1,
          z: z - 4,
          width: 3,
          depth: 2.4,
          levels: 4,
          levelHeight: 0.55,
          color: 0x6c5a86,
        },
      ]
    : [],
});
/** A study corner: laptop, pencil pot, books and a mug waiting to be spilt. */
const study: Cluster = (x, z, lively) => ({
  pieces: [
    block('laptop', x, z - 4.5, 5, 0.35, 3.4, 0x3b3f45),
    ...(lively ? [] : [round('mug', x + 4, z + 3, 0.9, 1.9, 0xa37a58)]),
    round('pot', x - 3.5, z, 0.85, 2, 0x4f6f8a),
    round('spool', x - 2, z + 5, 0.5, 0.75, 0xc9b37a),
    books(x + 2.5, z + 0.5, 2.2, 2, 2, 0x995845),
  ],
  gadgets: lively
    ? [
        {
          type: 'spill',
          kind: 'mug',
          x: x + 4,
          z: z + 3,
          radius: 0.9,
          height: 1.9,
          puddle: 3.4,
          color: 0x5a3a22,
        },
      ]
    : [],
});

/** Breakfast things: bread on its board, butter, jam and a toaster that pops. */
const breakfast: Cluster = (x, z) => ({
  pieces: [
    block('board', x + 2.6, z + 2.8, 4.6, 0.3, 2.8, 0xd9b98a),
    block('loaf', x + 2.9, z + 2.8, 2.4, 1.7, 1.5, 0xc98a4b, 0.3),
    block('butter', x - 0.6, z + 4.6, 2.4, 0.62, 1.55, 0xf2e6a0),
    round('jam', x + 4.2, z - 2.4, 0.75, 1.95, 0xa0283c),
    round('plates', x - 4.2, z + 1.8, 1.1, 0.9, 0xf2f2f2),
    round('apple', x + 0.4, z - 4.6, 0.6, 1.1, 0xc0392b),
  ],
  gadgets: [
    {
      type: 'launcher',
      kind: 'toaster',
      x: x - 3,
      z: z - 2.8,
      heading: 0,
      width: 3,
      height: 2.2,
      depth: 1.6,
      period: 7,
      power: 12.5,
    },
  ],
});
/** The hob: a pan to stand in, pepper, a carton and a kettle on the boil. */
const hob: Cluster = (x, z) => ({
  pieces: [
    round('pan', x - 0.4, z + 2.2, 2, 0.45, 0x2a2a2a),
    round('mill', x - 4.4, z - 0.6, 0.34, 3.1, 0x4a2d1c),
    block('carton', x + 4.6, z + 3.4, 1.2, 3.5, 1.1, 0xf0b429),
    round('jam', x - 3.6, z + 4.4, 0.75, 1.95, 0xa0283c),
    block('butter', x + 1.2, z - 4.4, 2.4, 0.62, 1.55, 0xf2e6a0),
  ],
  gadgets: [
    {
      type: 'blower',
      kind: 'kettle',
      x: x + 3.4,
      z: z - 2.4,
      radius: 1.15,
      height: 2.3,
      // The spout points back towards the sink in the middle.
      heading: Math.atan2(-(x + 3.4), SINK.z - (z - 2.4)),
      sweep: 0,
      sweepSeconds: 1,
      period: 6.5,
      duty: 0.3,
      range: 13,
      halfAngle: 0.5,
      force: 150,
    },
  ],
});

/** The sink in the middle of the worktop, under the first lamp. */
const SINK: Pit = { x: 0, z: 5, width: 9, depth: 6.4 };
/** Round the sink: a board laid across it, milk, plates and fruit. */
const sinkSide = (): { pieces: TerrainPiece[]; gadgets: GadgetSpec[] } => ({
  pieces: [
    // The only way over without fluttering, and a shove from the drink.
    block('board', SINK.x, SINK.z + 0.4, SINK.width + 2, 0.3, 2.4, 0xd9b98a),
    round('apple', -5.9, 0.6, 0.6, 1.1, 0xc0392b),
    round('jam', 6.2, 9.6, 0.75, 1.95, 0xa0283c),
    block('butter', -6.4, 9.9, 2.4, 0.62, 1.55, 0xf2e6a0),
  ],
  gadgets: [
    {
      type: 'spill',
      kind: 'milk',
      x: -2.6,
      z: 0.4,
      radius: 0.55,
      height: 2.3,
      puddle: 3.4,
      color: 0xf4f1e8,
    },
    {
      type: 'topple',
      kind: 'plates',
      x: 3.2,
      z: 0.2,
      width: 2.2,
      depth: 2.2,
      levels: 5,
      levelHeight: 0.22,
      color: 0xf2f2f2,
    },
  ],
});

/**
 * Seeded scatter between the lamps, so routes have cover and detours. The
 * same seed always gives the same layout. Pieces keep clear of lamp clusters
 * and the fixed start slots, and of anything `avoid` names.
 */
function scatter(
  count: number,
  seed: number,
  kitchen: boolean,
  avoid: (x: number, z: number) => boolean,
  /** Spread over the whole front of the surface, close in to the lamps. */
  open = false,
): TerrainPiece[] {
  const random = seeded(seed);
  const palette = [
    0x6c5a86, 0x8a7a3e, 0x526e6d, 0x995845, 0xb04a3a, 0x4a6b5a, 0x3f5d87,
  ];
  const colour = () => palette[Math.floor(random() * palette.length)]!;
  const placed: { x: number; z: number }[] = [];
  const pieces: TerrainPiece[] = [];
  for (
    let attempt = 0;
    pieces.length < count && attempt < count * 40;
    attempt++
  ) {
    const x = (random() * 2 - 1) * (DESK.width / 2 - 8);
    const z = open
      ? -1.4 + random() * (DESK.depth / 2 - 1.6)
      : (random() * 2 - 1) * (DESK.depth / 2 - 12);
    const clear =
      LAMP_SPOTS.every(
        (spot) => Math.hypot(spot.x - x, spot.z - z) > (open ? 8 : 13),
      ) &&
      [START_A, START_B].every(
        (spot) => Math.hypot(spot.x - x, spot.z - z) > (open ? 6 : 16),
      ) &&
      placed.every((spot) => Math.hypot(spot.x - x, spot.z - z) > 6) &&
      !avoid(x, z);
    if (!clear) continue;
    placed.push({ x, z });
    const roll = random();
    if (kitchen) {
      if (roll < 0.25) pieces.push(round('apple', x, z, 0.6, 1.1, 0xc0392b));
      else if (roll < 0.42)
        pieces.push(round('jam', x, z, 0.75, 1.95, 0xa0283c));
      else if (roll < 0.57)
        pieces.push(round('plates', x, z, 1.1, 0.9, 0xf2f2f2));
      else if (roll < 0.7)
        pieces.push(block('butter', x, z, 2.4, 0.62, 1.55, 0xf2e6a0));
      else if (roll < 0.8) pieces.push(round('tin', x, z, 1.1, 0.5, 0x7d8e6a));
      else if (roll < 0.9)
        pieces.push(block('loaf', x, z, 2.4, 1.7, 1.5, 0xc98a4b));
      else pieces.push(round('mill', x, z, 0.34, 3.1, 0x4a2d1c));
      continue;
    }
    if (roll < 0.4)
      pieces.push(
        books(
          x,
          z,
          2 + random() * 1.5,
          1.8 + random(),
          2 + Math.floor(random() * 3),
          colour(),
        ),
      );
    else if (roll < 0.55)
      pieces.push(block('box', x, z, 1.9, 1, 1.2, colour()));
    else if (roll < 0.68)
      pieces.push(block('pad', x, z, 1.4, 0.28, 1.4, 0xe0c65a));
    else if (roll < 0.78) pieces.push(round('tin', x, z, 1.1, 0.5, 0x7d8e6a));
    else if (roll < 0.86)
      pieces.push(round('spool', x, z, 0.5, 0.75, colour()));
    else if (roll < 0.93) pieces.push(round('mug', x, z, 0.9, 1.9, 0xa37a58));
    else pieces.push(round('pot', x, z, 0.85, 2, 0x4f6f8a));
  }
  return pieces;
}

/** The surface, cut into slabs round any pits. */
function surface(pits: readonly Pit[], color: number): BoxPiece[] {
  const slab = (x0: number, x1: number, z0: number, z1: number): BoxPiece => ({
    kind: 'desk',
    shape: 'box',
    x: (x0 + x1) / 2,
    y: -0.25,
    z: (z0 + z1) / 2,
    width: x1 - x0,
    height: 0.5,
    depth: z1 - z0,
    color,
  });
  const [w, d] = [DESK.width / 2, DESK.depth / 2];
  const pit = pits[0];
  if (!pit) return [slab(-w, w, -d, d)];
  const [left, right] = [pit.x - pit.width / 2, pit.x + pit.width / 2];
  const [back, front] = [pit.z - pit.depth / 2, pit.z + pit.depth / 2];
  return [
    slab(-w, w, -d, back),
    slab(-w, w, front, d),
    slab(-w, left, back, front),
    slab(right, w, back, front),
  ];
}

/** The seed every layout used before they were shuffled; tests still do. */
export const FIXED_SEED = 20261127;
/** Clutter is about as dense whatever the surface size. */
const CLUTTER = Math.round(60 * BOARD_SCALE ** 2 * 1.6);

export type Level = {
  /** Order matters: the surface first, then each team's nearby perch. */
  terrain: TerrainPiece[];
  gadgets: GadgetSpec[];
  pits: Pit[];
};

/** A plank out over the front edge, with a perch on the end of it. */
const overhang = (x: number, kitchen: boolean): TerrainPiece[] => {
  const edge = DESK.depth / 2;
  return [
    block(kitchen ? 'board' : 'ruler', x, edge - 0.6, 1.7, 0.18, 5.2, 0xe8c15a),
    kitchen
      ? round('apple', x, edge + 1.4, 0.6, 1.1, 0xc0392b, 0.18)
      : block('eraser', x, edge + 1.4, 1.5, 0.5, 0.9, 0xd98a96, 0.18),
  ];
};

/**
 * Lay a level out. With no `seed` it is the original fixed desk, with nothing
 * that moves: the layout every test was written against. With one, the
 * clusters swap lamps, the clutter is reshuffled and the gadgets come out.
 */
export function buildLevel(id: LevelId, seed?: number): Level {
  const lively = seed !== undefined;
  const random = seeded(seed ?? FIXED_SEED);
  const kitchen = id === 'kitchen';
  const pits = kitchen ? [SINK] : [];
  const low = LAMP_SPOTS.slice(0, 3);
  const gadgets: GadgetSpec[] = [];
  const clustered: TerrainPiece[] = [];
  if (kitchen) {
    const middle = sinkSide();
    clustered.push(...middle.pieces);
    gadgets.push(...middle.gadgets);
    // Breakfast and the hob take a side each.
    const swap = lively && random() < 0.5;
    [breakfast, hob].forEach((cluster, index) => {
      const spot = low[1 + (swap ? 1 - index : index)]!;
      const made = cluster(spot.x, spot.z, lively);
      clustered.push(...made.pieces);
      gadgets.push(...made.gadgets);
    });
  } else {
    const turn = lively ? Math.floor(random() * 3) : 0;
    [ring, study, tower].forEach((cluster, index) => {
      const spot = low[(index + turn) % 3]!;
      const made = cluster(spot.x, spot.z, lively);
      clustered.push(...made.pieces);
      gadgets.push(...made.gadgets);
    });
  }
  const inPit = (x: number, z: number) =>
    pits.some(
      (pit) =>
        Math.abs(x - pit.x) < pit.width / 2 + 2.4 &&
        Math.abs(z - pit.z) < pit.depth / 2 + 2.4,
    );
  // Where the fixed gadgets and the overhang go: nothing is scattered there.
  const reserved = [
    { x: -7, z: 13.5 },
    { x: 8.5, z: 13.2 },
    { x: -14, z: 15 },
    { x: 14, z: 15 },
    { x: -13, z: -11.6 },
  ];
  const fresh = lively || kitchen;
  const clutter = scatter(
    fresh ? CLUTTER + 5 : CLUTTER,
    lively ? Math.floor(random() * 2 ** 31) : FIXED_SEED,
    kitchen,
    fresh
      ? (x, z) =>
          inLane(x, z) ||
          inPit(x, z) ||
          reserved.some((spot) => Math.hypot(spot.x - x, spot.z - z) < 4.2)
      : () => false,
    fresh,
  );
  if (lively) {
    gadgets.push({
      type: 'runner',
      kind: kitchen ? 'mouse' : 'car',
      path: lap(),
      speed: kitchen ? 6 : 7.5,
      length: kitchen ? 2 : 2.4,
      width: 1.16,
      height: 0.95,
      push: 8,
    });
    gadgets.push({
      type: 'roller',
      kind: kitchen ? 'pin' : 'pencil',
      x: 8.5,
      z: 13.2,
      heading: Math.PI / 2,
      length: kitchen ? 5 : 4.6,
      radius: kitchen ? 0.5 : 0.24,
    });
    if (!kitchen) {
      gadgets.push({
        type: 'blower',
        kind: 'fan',
        x: -13,
        z: -11.6,
        radius: 1,
        height: 3.4,
        heading: 0,
        sweep: 0.75,
        sweepSeconds: 7,
        period: 1,
        duty: 1,
        range: 16,
        halfAngle: 0.38,
        force: 120,
      });
      gadgets.push({
        type: 'launcher',
        kind: 'seesaw',
        x: -7,
        z: 13.5,
        heading: 0,
        width: 1.5,
        height: 0.5,
        depth: 4.6,
        period: 0,
        power: 11,
      });
    }
  }
  return {
    terrain: [
      ...surface(pits, kitchen ? 0xd9d2c4 : 0x79523b),
      books(START_A.x + 0.9, START_A.z - 2.1, 2.5, 2, 2, 0x995845),
      books(START_B.x - 0.9, START_B.z - 2.25, 2.2, 2.4, 3, 0x526e6d),
      ...clustered,
      ...corner(-1, kitchen),
      ...corner(1, kitchen),
      ...summit(kitchen),
      ...clutter,
      ...(lively ? overhang(kitchen ? -14 : 14, kitchen) : []),
    ],
    gadgets,
    pits,
  };
}
