import {
  buildLevel,
  DESK,
  LAMP_SPOTS,
  START_A,
  START_B,
  START_C,
  START_D,
  type LevelId,
} from './level/layout';

export type {
  BoxPiece,
  CylinderPiece,
  GadgetSpec,
  LevelId,
  Pit,
  TerrainPiece,
} from './level/layout';
export { LEVELS } from './level/layout';

/** Where the title screen keeps the chosen line-up between page loads. */
export const SETUP_KEY = 'moth-fight-club:setup';
export type Setup = {
  /** Teams round the desk, 2 to 4. */
  teams: number;
  /** How many of them people play, from none; the computer plays the rest. */
  humans: number;
  /** Moths in each team, 1 to 5; left out, it follows the number of teams. */
  moths?: number;
  /** Which level to play on. */
  level?: LevelId;
  /** Lay the level out from this seed, instead of afresh each load. */
  seed?: number;
  /** True for the one load that follows a change of line-up: skip the title. */
  autostart?: boolean;
};
/** The most moths a team can have. */
export const MAX_TEAM_SIZE = 5;
/** Moths a team has unless told otherwise: fewer as more teams share the desk. */
export const defaultTeamSize = (teams: number) => [4, 4, 4, 3, 2][teams] ?? 4;
/** The line-up chosen on the title screen, or two human teams. */
export function readSetup(): Setup {
  try {
    const saved = JSON.parse(
      globalThis.sessionStorage?.getItem(SETUP_KEY) ?? 'null',
    ) as Partial<Setup> | null;
    const teams = Math.min(4, Math.max(2, Math.round(saved?.teams ?? 2)));
    // None at all is allowed: the computer plays every team, to watch.
    const humans = Math.min(teams, Math.max(0, Math.round(saved?.humans ?? 2)));
    const moths = Math.min(
      MAX_TEAM_SIZE,
      Math.max(1, Math.round(saved?.moths ?? defaultTeamSize(teams))),
    );
    const level: LevelId = saved?.level === 'kitchen' ? 'kitchen' : 'desk';
    const seed = Number.isFinite(saved?.seed) ? Number(saved?.seed) : undefined;
    return {
      teams,
      humans,
      moths,
      level,
      seed,
      autostart: !!saved?.autostart,
    };
  } catch {
    return { teams: 2, humans: 2, moths: defaultTeamSize(2), level: 'desk' };
  }
}
/**
 * How many teams this page was loaded for. The moths, their colours and the
 * scoreboard are all laid out once from this, so changing it reloads the page.
 */
export const TEAM_COUNT = readSetup().teams;
/** Moths in each team for this page load. */
export const TEAM_SIZE = readSetup().moths ?? defaultTeamSize(TEAM_COUNT);

/** The level this page was loaded for; changing it reloads the page. */
export const LEVEL: LevelId = readSetup().level ?? 'desk';
/**
 * Every page load lays the level out afresh. Tests keep the one fixed
 * layout, with nothing on it that moves, so they stay predictable.
 */
const LAYOUT = buildLevel(
  LEVEL,
  readSetup().seed ??
    (import.meta.env?.MODE === 'test'
      ? undefined
      : Math.floor(Math.random() * 2 ** 31)),
);

/** Up to five moths per team, with names and slightly different wing colours. */
const TEAMS = [
  {
    start: START_A,
    names: ['Dusty', 'Big Flap', 'Lampwick', 'Fuzzby', 'Crumbs'],
    colours: [0xc89743, 0xd4a24f, 0xb8853a, 0xcf9a5c, 0xc08f4a],
  },
  {
    start: START_B,
    names: ['Mothhew', 'Wingston', 'Nibbles', 'Tatters', 'Flit'],
    colours: [0x599e98, 0x4f948e, 0x66aaa2, 0x5a8f9e, 0x5ea39a],
  },
  {
    start: START_C,
    names: ['Velvet', 'Plum', 'Thistle', 'Dusk', 'Fig'],
    colours: [0x8a5fc4, 0x9a6fd0, 0x7a52b3, 0xa07ad6, 0x9163c9],
  },
  {
    start: START_D,
    names: ['Moonbeam', 'Chalky', 'Pearl', 'Wisp', 'Dandy'],
    colours: [0xe9dfc6, 0xf2e9d2, 0xdcd0b4, 0xefe3cc, 0xe4d8bc],
  },
].slice(0, TEAM_COUNT);
/** Fixed slots around each start point, clear of the first moth's book perch. */
const SLOTS = [
  { x: 0, z: 0 },
  { x: 0, z: 5 },
  { x: 0, z: -6 },
  { x: 4, z: 3 },
  { x: 4, z: -4 },
] as const;

export const ARENA = {
  lampRadius: 0.32,
  mothRadius: 0.48,
  desk: DESK,
  /** Order matters: the surface first, then each team's nearby book perch. */
  terrain: LAYOUT.terrain,
  /** What moves or reacts on this level; the world brings them to life. */
  gadgets: LAYOUT.gadgets,
  /** Holes in the surface. */
  pits: LAYOUT.pits,
  /**
   * Moth 0 and moth 1 lead each team, so key 1 is Dusty and key 2 is
   * Mothhew; the rest alternate teams.
   */
  spawns: Array.from({ length: TEAM_SIZE }, (_, slot) => slot).flatMap((slot) =>
    TEAMS.map((team, teamIndex) => {
      // Every other team faces the other way, so mirror its slots.
      const side = teamIndex % 2 === 0 ? 1 : -1;
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

/** True over a hole in the surface, or within `margin` of one. */
export const overPit = (x: number, z: number, margin = 0) =>
  ARENA.pits.some(
    (pit) =>
      Math.abs(x - pit.x) < pit.width / 2 + margin &&
      Math.abs(z - pit.z) < pit.depth / 2 + margin,
  );
/** The nearest spot to (x, z) with solid surface under it. */
export function besidePits<T extends { x: number; z: number }>(spot: T): T {
  for (const pit of ARENA.pits) {
    const dx = spot.x - pit.x;
    const dz = spot.z - pit.z;
    const reachX = pit.width / 2 + 1;
    const reachZ = pit.depth / 2 + 1;
    if (Math.abs(dx) >= reachX || Math.abs(dz) >= reachZ) continue;
    // Out through whichever side is nearest.
    if (reachX - Math.abs(dx) < reachZ - Math.abs(dz))
      return { ...spot, x: pit.x + (dx < 0 ? -reachX : reachX) };
    return { ...spot, z: pit.z + (dz < 0 ? -reachZ : reachZ) };
  }
  return spot;
}

export const MAX_LAMPS = 8;

/**
 * Hanging lamps. Each one scores its own area of the desk. Count, height,
 * tether and positions rebuild the scene; the halo radius applies live.
 */
export const LAMPS = {
  count: 6,
  /** Height of a lamp's anchor above the surface it lights. */
  anchorHeight: 9,
  tetherLength: 4,
  /** Lit radius on the desk is about 4.9 with the lamp hanging at rest. */
  haloRadius: 7,
  /** `base` is the height of the surface each lamp lights; 0 is the desk. */
  positions: LAMP_SPOTS.map(({ x, z, base }) => ({ x, z, base })),
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
export const TEAM_COLOURS = [0xffc65c, 0x5fe6d6, 0xb98cff, 0xf4ecd8] as const;

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

export type WeaponId = 'gust' | 'bosh' | 'zap' | 'cap' | 'firecracker' | 'mind';
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
  { id: 'mind', name: 'Mind Control', charge: false },
];

/**
 * Mind Control: a moth takes over a giant of its choosing and brings that
 * giant's hand down wherever it likes on the desk. Once a match for each team.
 */
export const MIND = {
  /** How fast the target moves across the desk while aiming. */
  aimSpeed: 16,
  /** How far in front of the moth the target starts. */
  startAhead: 7,
  /** Seconds between the order and the hand landing. */
  warnSeconds: 1.9,
  /** Seconds the giant stays glowing under the spell. */
  spellSeconds: 3.2,
};

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

/** The teams in play, told apart by an icon and a name as well as colour. */
export const TEAM_LABELS = [
  { name: 'Mustard', icon: '▲' },
  { name: 'Teal', icon: '●' },
  { name: 'Purple', icon: '■' },
  { name: 'Ivory', icon: '◆' },
].slice(0, TEAM_COUNT);

/** Match rules: rounds, turns, scoring and zappers. All values are tunable. */
export const MATCH = {
  /** The first team to bank this many points wins on the spot. */
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
  /** Mind Controls each team may use in a match. */
  mindControls: 1,
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
  /** The longer wind-up, with a countdown, when a hanging hand is let go. */
  strikeSeconds: 2.4,
  /**
   * How high a giant can reach. Lamps, moths and noises above this are safe
   * from the hands: that is the point of climbing.
   */
  reach: 2.6,
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
  /** Seconds a dance lasts. */
  seconds: 2.8,
  /** One name per routine, shown as a pop-up. */
  names: ['Shadow Boxing', 'The Big Flap', 'The Siuuu'],
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
  /** The moths' own lines after a move or an attack. */
  mothVoice: 1.15,
  /** The giants grumbling at the moths as they swat. */
  giantVoice: 1.4,
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
