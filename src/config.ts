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

const DESK = { width: 250, depth: 134 } as const;

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
} // Each team starts at its own end of the desk, beside a low book perch.
const BASE_A = { x: -110, z: 0 } as const;
const BASE_B = { x: 110, z: 0 } as const;

/** Where the lamps hang; each one gets a cluster of perches beneath it. */
const LAMP_SPOTS = [
  { x: 0, z: 0 },
  { x: -45, z: -30 },
  { x: -45, z: 30 },
  { x: 45, z: -30 },
  { x: 45, z: 30 },
  { x: -80, z: 0 },
  { x: 80, z: 0 },
  { x: 0, z: 45 },
] as const;

type Cluster = (x: number, z: number) => TerrainPiece[];
/** A ring of low perches inside a lamp's light. */
const ring: Cluster = (x, z) => [
  books(x - 3.2, z - 2.6, 2.6, 2.2, 2, 0x6c5a86),
  books(x + 3.4, z + 2.4, 2.4, 2.2, 3, 0x8a7a3e),
  block('pad', x + 0.4, z + 4.4, 1.4, 0.28, 1.4, 0xe0c65a),
  block('box', x - 4, z + 2.6, 1.9, 1, 1.2, 0xb04a3a),
  round('spool', x + 3.2, z - 3, 0.5, 0.75, 0x9f6051),
];
/** A tall book tower with steps up to it. */
const tower: Cluster = (x, z) => [
  books(x - 1, z - 4, 3, 2.4, 4, 0x6c5a86, 0.55),
  books(x + 2, z - 3.6, 1.8, 2.2, 2, 0x8a7a3e, 0.55),
  round('tin', x - 2.5, z + 3.5, 1.1, 0.5, 0x7d8e6a),
  block('pad', x + 2.5, z + 3.5, 1.1, 0.36, 0.6, 0xd98a96),
  block('box', x + 4.5, z + 0.5, 1.9, 1, 1.2, 0x5a7f4f),
];
/** A study corner: closed laptop, mug, pencil pot and books. */
const study: Cluster = (x, z) => [
  block('laptop', x, z - 4.5, 5, 0.35, 3.4, 0x3b3f45),
  round('mug', x + 4, z + 3, 0.9, 1.9, 0xa37a58),
  round('pot', x - 3.5, z, 0.85, 2, 0x4f6f8a),
  round('spool', x - 2, z + 5, 0.5, 0.75, 0xc9b37a),
  books(x + 2.5, z + 0.5, 2.2, 2, 2, 0x995845),
];
const CLUSTERS: Cluster[] = [
  ring,
  tower,
  study,
  study,
  tower,
  ring,
  ring,
  tower,
];

/** Each team's corner: a pencil-case wall behind its four starting slots. */
function base(x: number, side: 1 | -1): TerrainPiece[] {
  return [
    block('box', x + side * 4, 0, 1.6, 0.8, 14, side < 0 ? 0x3f5d87 : 0xa04f43),
    round('tin', x + side * 1, 9, 1.1, 0.5, 0x7d8e6a),
  ];
}

/**
 * Seeded scatter between the lamps, so routes have cover and detours. The
 * same seed always gives the same desk. Pieces keep clear of lamp clusters,
 * team bases and a strip along the front edge kept free for testing.
 */
function scatter(count: number, seed: number): TerrainPiece[] {
  let state = seed;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
    const z = (random() * 2 - 1) * (DESK.depth / 2 - 12);
    const clear =
      LAMP_SPOTS.every((spot) => Math.hypot(spot.x - x, spot.z - z) > 13) &&
      [BASE_A, BASE_B].every(
        (spot) => Math.hypot(spot.x - x, spot.z - z) > 16,
      ) &&
      placed.every((spot) => Math.hypot(spot.x - x, spot.z - z) > 6);
    if (!clear) continue;
    placed.push({ x, z });
    const roll = random();
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

/** Four moths per team, with names and slightly different wing colours. */
const TEAMS = [
  {
    base: BASE_A,
    names: ['Dusty', 'Big Flap', 'Lampwick', 'Fuzzby'],
    colours: [0xc89743, 0xd4a24f, 0xb8853a, 0xcf9a5c],
  },
  {
    base: BASE_B,
    names: ['Mothhew', 'Wingston', 'Nibbles', 'Tatters'],
    colours: [0x599e98, 0x4f948e, 0x66aaa2, 0x5a8f9e],
  },
] as const;
/** Starting slots around each base, clear of the first moth's book perch. */
const SLOTS = [
  { x: 0, z: 0 },
  { x: 0, z: 5 },
  { x: 0, z: -6 },
  { x: 4, z: 3 },
] as const;

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
    ...base(BASE_A.x, -1),
    ...base(BASE_B.x, 1),
    // A wide notebook behind the centre lamp makes a raised stage.
    block('pad', 0, -10, 7, 0.3, 5, 0x4a6b5a),
    ...LAMP_SPOTS.flatMap((spot, index) => CLUSTERS[index]!(spot.x, spot.z)),
    ...scatter(60, 20261127),
  ] satisfies TerrainPiece[] as TerrainPiece[],
  /**
   * Moth 0 and moth 1 lead each team, so key 1 is Dusty and key 2 is
   * Mothhew; the rest alternate teams.
   */
  spawns: [0, 1, 2, 3].flatMap((slot) =>
    TEAMS.map((team, teamIndex) => {
      // Team B's base faces the other way, so mirror its slots.
      const side = teamIndex === 0 ? 1 : -1;
      return {
        name: team.names[slot]!,
        team: teamIndex,
        x: team.base.x + side * SLOTS[slot]!.x,
        y: 0.5,
        z: team.base.z + SLOTS[slot]!.z,
        color: team.colours[slot]!,
      };
    }),
  ),
} as const;

export const MAX_LAMPS = 8;

/**
 * Hanging lamps. Each one scores its own area of the desk. Count, height,
 * tether and positions rebuild the scene; the halo radius applies live.
 */
export const LAMPS = {
  count: 7,
  anchorHeight: 9,
  tetherLength: 4,
  /** Lit radius on the desk is about 4.9 with the lamp hanging at rest. */
  haloRadius: 7,
  positions: LAMP_SPOTS.map(({ x, z }) => ({ x, z })),
};

export const LIGHTING = {
  lampIntensity: 280,
  lampAngle: 1.25,
  ambient: 1.15,
  moon: 160,
  exposure: 1.2,
  fog: 0.0016,
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
  length: 0.06,
  /** Strands per unit of texture height. */
  density: 70,
  /** Strand width at the root, as a fraction of its cell. */
  thickness: 0.55,
  /** How much the tips sag under gravity. */
  droop: 0.35,
  /** How much darker the roots are than the tips. */
  rootShade: 0.45,
};

/** Wing Gust: a short-range cone that pushes moths and swings lamps. */
export const GUST = {
  /** Reach across the desk. */
  range: 4.5,
  /** Half the cone's width, in radians (about 40 degrees). */
  halfAngle: 0.7,
  /** Height band the gust affects, relative to the attacker. */
  reachDown: 1.5,
  reachUp: 6,
  /** Horizontal speed given to a moth at point-blank range. */
  force: 9,
  /** Upward speed given to a moth at point-blank range. */
  lift: 4,
  /** Horizontal speed given to a lamp at point-blank range. */
  lampForce: 5,
  /** Fraction of the push left at the edge of the range. */
  minFalloff: 0.35,
  /** Seconds a hit moth slides without braking. */
  stagger: 0.6,
};

export type WeaponId = 'gust' | 'bosh' | 'zap' | 'cap' | 'firecracker';
/** The weapon menu, in order. `charge` weapons fire harder the longer held. */
export const WEAPONS: readonly {
  id: WeaponId;
  name: string;
  charge: boolean;
}[] = [
  { id: 'gust', name: 'Wing Gust', charge: false },
  { id: 'bosh', name: 'Bosh', charge: false },
  { id: 'zap', name: 'Zap Switch', charge: false },
  { id: 'cap', name: 'Bottle-Cap Flick', charge: true },
  { id: 'firecracker', name: 'Firecracker', charge: true },
];

/** Bosh: a big close-range punch on the single nearest moth in front. */
export const BOSH = {
  /** Reach across the desk, from moth centre to moth centre. */
  range: 1.9,
  /** Half the punch's aiming arc, in radians (about 40 degrees). */
  halfAngle: 0.7,
  /** Height difference it can still connect across. */
  reach: 1.2,
  /** Horizontal speed given to the moth it hits. */
  force: 17,
  lift: 6,
  /** Push given to a lamp bulb punched directly. */
  lampForce: 8,
  /** Seconds the hit moth slides without braking. */
  stagger: 0.9,
  /** Screen shake on a connecting punch, in world units. */
  shake: 0.22,
};

/** Weapon playground rules; the turn system replaces these later. */
export const PLAYGROUND = {
  /** Seconds between any two weapon uses. */
  cooldown: 0.8,
};

export const AIM = {
  /** Seconds of holding fire to reach full power. */
  chargeSeconds: 1.1,
  /** Added to the camera's pitch, so a slightly downward view aims level-up. */
  pitchOffset: 0.6,
  /** Launch pitch used in the board view, where the camera is overhead. */
  boardPitch: 0.6,
  minPitch: -0.2,
  maxPitch: 1.3,
};

/** Zap Switch: inverts a lamp into a bug zapper. */
export const ZAP = {
  /** Playground seconds a lamp stays a zapper (a full round, later). */
  duration: 8,
  /** Horizontal launch speed away from the zapper. */
  launch: 7,
  /** Upward launch speed. */
  lift: 9,
  /** Seconds of comic tumbling before the moth puffs back to base. */
  flightTime: 1.3,
  /** Real-time freeze-frame on a zap, in seconds. */
  hitstop: 0.18,
};

export const CAP = {
  minSpeed: 9,
  maxSpeed: 22,
  radius: 0.16,
  mass: 0.2,
  bounciness: 0.75,
  /** Horizontal speed given to a moth it strikes. */
  knock: 10,
  lift: 3,
  /** Seconds before an unused cap disappears. */
  lifetime: 3,
};

export const FIRECRACKER = {
  minSpeed: 5,
  maxSpeed: 13,
  radius: 0.18,
  mass: 0.3,
  bounciness: 0.45,
  fuse: 2.2,
  /** Blast reach for moths, measured from the blast to the moth's centre. */
  blastRadius: 3.2,
  force: 11,
  lift: 5,
  /** Blast reach and push for lamp bulbs. */
  lampRadius: 4.5,
  lampForce: 6,
};

/** Sound mix. Samples are optional; see public/sounds/README.md. */
export const AUDIO = {
  master: 0.9,
  effects: 1,
  /** Night room tone with crickets, under everything. */
  ambience: 0.35,
  /** Distance at which a sound is at half volume. */
  falloff: 30,
};

export const PHYSICS_STEP_MS = 1000 / 60;
export const MAX_FRAME_MS = 100;

// Movement, camera and lighting are deliberately mutable: the tuning panel
// edits them while the game runs.
export const MOVEMENT = {
  speed: 8,
  groundAcceleration: 55,
  /** Steering strength in the air while a direction is held. */
  airAcceleration: 30,
  /** Horizontal slowing in the air once the stick or keys are released. */
  airBrake: 16,
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
  wallLimitZ: -69,
  /** Flip camera look direction for the right stick and mouse drag. */
  invertX: true,
  invertY: true,
  stickSpeed: 1.5,
  fov: 42,
};
