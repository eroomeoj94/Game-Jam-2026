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

/** Shrinks or grows the desk and everything laid out on it. */
const BOARD_SCALE = 0.36;
const DESK = { width: 250 * BOARD_SCALE, depth: 134 * BOARD_SCALE } as const;
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

/**
 * Fixed start slots at each end of the desk, beside a low book perch. The game
 * drops moths in at random; tests and the respawn fallback use these slots.
 */
const START_A = scaled({ x: -110, z: 0 });
const START_B = scaled({ x: 110, z: 0 });

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
].map(scaled);

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

/**
 * Seeded scatter between the lamps, so routes have cover and detours. The
 * same seed always gives the same desk. Pieces keep clear of lamp clusters,
 * the fixed start slots and a strip along the front edge kept free for testing.
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
      [START_A, START_B].every(
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
    start: START_A,
    names: ['Dusty', 'Big Flap', 'Lampwick', 'Fuzzby'],
    colours: [0xc89743, 0xd4a24f, 0xb8853a, 0xcf9a5c],
  },
  {
    start: START_B,
    names: ['Mothhew', 'Wingston', 'Nibbles', 'Tatters'],
    colours: [0x599e98, 0x4f948e, 0x66aaa2, 0x5a8f9e],
  },
] as const;
/** Fixed slots around each start point, clear of the first moth's book perch. */
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
    books(START_A.x + 0.9, START_A.z - 2.1, 2.5, 2, 2, 0x995845),
    books(START_B.x - 0.9, START_B.z - 2.25, 2.2, 2.4, 3, 0x526e6d),
    // A wide notebook behind the centre lamp makes a raised stage.
    ...[
      block('pad', 0, -10 * BOARD_SCALE * 2, 7, 0.3, 5, 0x4a6b5a),
      ...LAMP_SPOTS.flatMap((spot, index) => CLUSTERS[index]!(spot.x, spot.z)),
      // Keep the clutter about as dense whatever the desk size.
      ...scatter(Math.round(60 * BOARD_SCALE ** 2 * 1.6), 20261127),
    ],
  ] satisfies TerrainPiece[] as TerrainPiece[],
  /**
   * Moth 0 and moth 1 lead each team, so key 1 is Dusty and key 2 is
   * Mothhew; the rest alternate teams.
   */
  spawns: [0, 1, 2, 3].flatMap((slot) =>
    TEAMS.map((team, teamIndex) => {
      // Team B starts at the other end, so mirror its slots.
      const side = teamIndex === 0 ? 1 : -1;
      return {
        name: team.names[slot]!,
        team: teamIndex,
        x: team.start.x + side * SLOTS[slot]!.x,
        y: 0.5,
        z: team.start.z + SLOTS[slot]!.z,
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

/** How much the moths stand out from the dim desk. */
export const MOTH_LOOK = {
  /** Self-lit felt, so a moth reads clearly outside the lamps. 0 is off. */
  glow: 0.45,
  /** Opacity of the team-coloured ring under every moth. */
  ring: 0.8,
  /** Extra room light in the board view, so the whole desk reads. */
  boardLight: 2.4,
};
/** Ring and HUD colour for each team. */
export const TEAM_COLOURS = [0xffc65c, 0x5fe6d6] as const;

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
  force: 21,
  lift: 7.5,
  /** Push given to a lamp bulb punched directly. */
  lampForce: 8,
  /** Seconds the hit moth slides without braking. */
  stagger: 0.9,
  /** Screen shake on a connecting punch, in world units. */
  shake: 0.55,
  /** Real-time freeze-frame when a punch lands, in seconds. */
  hitstop: 0.14,
  /** Loudness of the punch and its boom, over the normal effect level. */
  loudness: 5,
};

/** The two teams, told apart by an icon and a name as well as colour. */
export const TEAM_LABELS = [
  { name: 'Mustard', icon: '▲' },
  { name: 'Teal', icon: '●' },
] as const;

/** Match rules: rounds, turns, scoring and zappers. All values are tunable. */
export const MATCH = {
  /** First team to reach this, ahead of the other at the end of a round. */
  targetScore: 10,
  /**
   * Seconds a moth may move in a turn, counted from its first movement.
   * 0 means no limit: the move ends when the player aims or passes.
   */
  moveSeconds: 0,
  /** Longest wait for a moth to land once its movement runs out. */
  settleSeconds: 1,
  /**
   * Shortest time the world runs after an action or pass. It keeps running
   * past this while anything is still flying, tumbling or dancing.
   */
  resolveSeconds: 0.8,
  /** Hard cap on a resolution that never comes to rest. */
  maxResolveSeconds: 6,
  /**
   * Each round a giant hand hangs over the most crowded lamp and comes down
   * after both teams have played, just before the round is scored.
   */
  roundSmack: true,
  /** Hard cap on waiting for that hand to land and the moths to settle. */
  maxSmackSeconds: 8,
  /** Zap Switches each team may use in a match. */
  zapSwitches: 2,
  /** Turns a zapper stays live after the turn it was flipped in. */
  zapperTurns: 1,
  /** Points a team loses when one of its moths is zapped. */
  zapPenalty: 1,
  /** Full rounds a zapped or fallen moth sits out before dropping back in. */
  restRounds: 1,
  /**
   * When lamps pay out. 'incoming': a team banks the lamps it still holds
   * at the end of its rival's turn, so a lamp only pays if it survives a
   * reply. 'round': every lamp scores for its holder once both teams have
   * played. Bot playtests (20 November): with 'round' the team playing second
   * won 15 of 20 matches between identical bots; with 'incoming' it was even.
   */
  scoring: 'incoming' as 'round' | 'incoming',
  /**
   * A lamp that pays the same team `burnAfter` times running burns out and
   * goes dark for `burnRounds` rounds, so nobody can sit on one all match.
   */
  burnOut: true,
  burnAfter: 2,
  burnRounds: 1,
  /** Each round one warm lamp, picked at random, is worth `hotPoints`. */
  hotLamp: true,
  hotPoints: 2,
  /**
   * Points the team that plays second starts with, to offset the edge that
   * going first showed in computer-versus-computer matches.
   */
  headStart: 0,
  /** Seconds the end-of-round result is shown before the next round. */
  bannerSeconds: 2.5,
};

/**
 * Giant hands: every so often, while the world is running, a huge human hand
 * slams the desk. Its shadow gives fair warning; any moth still under it
 * when it lands is flung outwards.
 */
export const HAZARD = {
  /** Seconds of running time from one hand leaving to the next shadow. */
  minGap: 2.5,
  maxGap: 6,
  /** Seconds the shadow looms before the hand lands. */
  warnSeconds: 1.6,
  /** Seconds the hand rests on the desk, then takes to lift away. */
  holdSeconds: 0.4,
  liftSeconds: 0.7,
  /** Moths within this distance of the palm's centre are hit. */
  radius: 4,
  /** Chance a hand aims at a lamp's light instead of anywhere on the desk. */
  lampBias: 0.6,
  /** Outward and upward speed given to a moth it hits. */
  force: 12,
  lift: 8,
  /** Seconds the hit moth tumbles without braking. */
  stagger: 1,
  /** Lamps within this distance swing from the jolt, up to this speed. */
  lampRadius: 14,
  lampForce: 2.4,
  /** Screen shake when a hand lands, in world units. */
  shake: 0.8,
  /** Loudness of the slap and its boom, over the normal effect level. */
  loudness: 2.4,
};

/** The room around the desk. */
export const ROOM = {
  /** Height of the floor; the desk top is at 0. */
  floorY: -40,
};

/**
 * The giants whose hands those are. They pace round the three open sides of
 * the desk whenever the world is running, and the nearest one does each smack.
 */
export const PEOPLE = {
  count: 3,
  /** Walking speed along the path round the desk. */
  speed: 5,
  /** How far from the desk's edge they walk. */
  offset: 11,
  /** How far short of the back wall the side paths stop. */
  backGap: 8,
  /** Closest two of them come before both turn away. */
  spacing: 26,
  /** How often, on average, one turns back on a whim. */
  turnsPerSecond: 0.06,
};

/** The end-of-turn dance: a moth shows off instead of attacking. */
export const DANCE = {
  /** Seconds a dance lasts; keep it within the match's resolve time. */
  seconds: 2.2,
  /** One name per routine, shown as a pop-up. */
  names: [
    'The Spin',
    'The Wiggle',
    'Shadow Boxing',
    'The Big Flap',
    'The Worm',
  ],
};

/** Weapon playground rules (open the page with ?playground). */
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
  /** Playground seconds a lamp stays a zapper. */
  duration: 8,
  /** How far across the desk a moth can be from the lamp it flips. */
  range: 10,
  /** Horizontal launch speed away from the zapper. */
  launch: 7,
  /** Upward launch speed. */
  lift: 9,
  /** Seconds of comic tumbling before the moth puffs back in somewhere new. */
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
  /** Background music: a light, sneaky pizzicato tune on a loop. */
  music: 0.3,
  /** The announcer's voice lines, when the clips are present. */
  voice: 1.3,
  /** Night room tone with crickets, kept faint under the music. */
  ambience: 0.1,
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
  /**
   * Fraction of the screen width the view is shifted. Negative puts the moth
   * right of centre, clear of the HUD panel on the left.
   */
  shoulderOffset: -0.12,
  followEase: 10,
  wallLimitZ: -(DESK.depth / 2 + 2),
  /** Flip camera look direction for the right stick and mouse drag. */
  invertX: true,
  invertY: true,
  stickSpeed: 1.5,
  fov: 42,
};
