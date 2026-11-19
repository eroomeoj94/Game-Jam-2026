import { ARENA, LAMPS, trackGap } from '../config';
import type { Position } from './world';

/** Chooses where moth `id` appears, given where the other moths are. */
export type Placement = (
  id: number,
  occupied: readonly Position[],
) => Position | undefined;

const EDGE_MARGIN = 4;
const MOTH_SPACING = 3;
const PROP_CLEARANCE = 0.4;
const LIGHT_MARGIN = 1.5;
const TRACK_CLEARANCE = 1.8;

/** Radius of a lamp's light on the desk while the lamp hangs at rest. */
export function restingLightRadius() {
  const height = LAMPS.anchorHeight - LAMPS.tetherLength;
  return Math.sqrt(Math.max(0, LAMPS.haloRadius ** 2 - height ** 2));
}

/**
 * True when a moth can stand on open desk at (x, z): inside the desk with a
 * margin, clear of every prop, outside every lamp's light (so nobody scores
 * or gets zapped on arrival), and spaced from the other moths.
 */
export function isClearSpot(
  x: number,
  z: number,
  occupied: readonly Position[] = [],
) {
  const { width, depth } = ARENA.desk;
  if (
    Math.abs(x) > width / 2 - EDGE_MARGIN ||
    Math.abs(z) > depth / 2 - EDGE_MARGIN
  )
    return false;
  // Nobody is dropped straight into the wind-up mouse's path.
  if (trackGap(x, z) < TRACK_CLEARANCE) return false;
  const reach = ARENA.mothRadius + PROP_CLEARANCE;
  for (const piece of ARENA.terrain) {
    if (piece.kind === 'desk') continue;
    if (piece.shape === 'box') {
      if (
        Math.abs(x - piece.x) < piece.width / 2 + reach &&
        Math.abs(z - piece.z) < piece.depth / 2 + reach
      )
        return false;
    } else if (Math.hypot(x - piece.x, z - piece.z) < piece.radius + reach)
      return false;
  }
  const light = restingLightRadius() + LIGHT_MARGIN;
  for (const lamp of LAMPS.positions.slice(0, LAMPS.count))
    if (Math.hypot(x - lamp.x, z - lamp.z) < light) return false;
  return occupied.every(
    (other) => Math.hypot(x - other.x, z - other.z) >= MOTH_SPACING,
  );
}

/** Random clear spots anywhere on the desk, drawn from `random` (0 to 1). */
export function randomPlacement(random: () => number = Math.random): Placement {
  return (_id, occupied) => {
    const { width, depth } = ARENA.desk;
    for (let attempt = 0; attempt < 400; attempt++) {
      const x = (random() * 2 - 1) * (width / 2 - EDGE_MARGIN);
      const z = (random() * 2 - 1) * (depth / 2 - EDGE_MARGIN);
      if (isClearSpot(x, z, occupied)) return { x, y: 0.5, z };
    }
    return undefined;
  };
}

/**
 * Clear spots just outside a lamp's light, one lamp after another, so every
 * moth starts a short walk from the action and the teams are spread around
 * the desk. Falls back to anywhere clear when a lamp's surroundings are full.
 */
export function nearLampPlacement(
  random: () => number = Math.random,
): Placement {
  const anywhere = randomPlacement(random);
  const lamps = LAMPS.positions.slice(0, LAMPS.count);
  // Start from a random lamp so matches do not all open the same way.
  let next = Math.floor(random() * Math.max(lamps.length, 1));
  return (id, occupied) => {
    const lamp = lamps[next++ % Math.max(lamps.length, 1)];
    if (!lamp) return anywhere(id, occupied);
    const inner = restingLightRadius() + LIGHT_MARGIN;
    for (let attempt = 0; attempt < 80; attempt++) {
      const angle = random() * Math.PI * 2;
      const distance = inner + 0.2 + random() * 4;
      const x = lamp.x + Math.cos(angle) * distance;
      const z = lamp.z + Math.sin(angle) * distance;
      if (isClearSpot(x, z, occupied)) return { x, y: 0.5, z };
    }
    return anywhere(id, occupied);
  };
}

/** The fixed starting slots from the arena, used by tests and as a fallback. */
export const fixedPlacement: Placement = (id) => {
  const spawn = ARENA.spawns[id];
  return spawn ? { x: spawn.x, y: spawn.y, z: spawn.z } : undefined;
};
