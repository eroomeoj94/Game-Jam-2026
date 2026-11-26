import { ARENA, LAMPS, overPit } from '../config';
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
  if (overPit(x, z, reach + 0.8)) return false;
  // Clear of anything that moves, and of the lane a runner drives round.
  for (const gadget of ARENA.gadgets) {
    if (gadget.type === 'runner') {
      const near = gadget.path.some((from, index) => {
        const to = gadget.path[(index + 1) % gadget.path.length]!;
        const [dx, dz] = [to.x - from.x, to.z - from.z];
        const along = Math.min(
          1,
          Math.max(
            0,
            ((x - from.x) * dx + (z - from.z) * dz) /
              Math.max(dx * dx + dz * dz, 1e-6),
          ),
        );
        return (
          Math.hypot(x - from.x - dx * along, z - from.z - dz * along) <
          gadget.width + reach + 0.6
        );
      });
      if (near) return false;
      continue;
    }
    const size =
      gadget.type === 'launcher'
        ? Math.max(gadget.width, gadget.depth) / 2
        : gadget.type === 'topple'
          ? Math.max(gadget.width, gadget.depth) / 2
          : gadget.type === 'roller'
            ? gadget.length / 2
            : gadget.radius;
    if (Math.hypot(x - gadget.x, z - gadget.z) < size + reach) return false;
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
  // Everyone starts on the desk: the tiers have to be climbed.
  const lamps = LAMPS.positions
    .slice(0, LAMPS.count)
    .filter(({ base }) => base === 0);
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
