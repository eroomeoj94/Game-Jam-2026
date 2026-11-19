import { describe, expect, it } from 'vitest';
import { ARENA, LAMPS } from '../config';
import {
  fixedPlacement,
  isClearSpot,
  nearLampPlacement,
  randomPlacement,
  restingLightRadius,
} from './spawns';
import { createWorld } from './world';

/** Small repeatable random source for tests. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('random spawns', () => {
  it('rejects props, lamp light, desk edges and crowding', () => {
    const lamp = LAMPS.positions[0]!;
    expect(isClearSpot(lamp.x, lamp.z)).toBe(false);
    expect(isClearSpot(lamp.x + restingLightRadius(), lamp.z)).toBe(false);
    const book = ARENA.terrain[1]!;
    expect(isClearSpot(book.x, book.z)).toBe(false);
    const front = ARENA.desk.depth / 2 - 5;
    expect(isClearSpot(ARENA.desk.width / 2 - 1, front)).toBe(false);
    const open = { x: 20, z: front };
    expect(isClearSpot(open.x, open.z)).toBe(true);
    expect(isClearSpot(open.x, open.z, [{ x: 21, y: 0.5, z: front }])).toBe(
      false,
    );
  });

  it('places every moth on a clear, spread-out spot', () => {
    const place = randomPlacement(seeded(7));
    const spots: { x: number; y: number; z: number }[] = [];
    for (const [id] of ARENA.spawns.entries()) {
      const spot = place(id, spots)!;
      expect(spot).toBeDefined();
      expect(isClearSpot(spot.x, spot.z, spots)).toBe(true);
      spots.push(spot);
    }
  });

  it('gives different layouts for different rolls', () => {
    const a = randomPlacement(seeded(1))(0, [])!;
    const b = randomPlacement(seeded(2))(0, [])!;
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.1);
  });

  it('starts a world with moths standing on open desk outside the light', () => {
    const world = createWorld({ placement: randomPlacement(seeded(3)) });
    try {
      for (let tick = 0; tick < 120; tick++) world.step();
      const view = world.snapshot();
      for (const moth of view.moths) {
        expect(moth.respawning).toBe(false);
        expect(moth.zapped).toBe(false);
        expect(moth.grounded).toBe(true);
        expect(moth.y).toBeCloseTo(ARENA.mothRadius, 1);
      }
      expect(view.teamZaps).toEqual([0, 0]);
    } finally {
      world.destroy();
    }
  });

  it('returns a fallen moth at a new random clear spot', () => {
    const world = createWorld({ placement: randomPlacement(seeded(11)) });
    try {
      world.placeMoth(0, { x: 0, y: 0.5, z: ARENA.desk.depth / 2 - 2 });
      let fell = false;
      for (let tick = 0; tick < 300 && !fell; tick++) {
        world.step({ x: 0, z: 1, jump: false, flutter: false });
        fell = world.snapshot().moths[0]!.respawning;
      }
      expect(fell).toBe(true);
      for (let tick = 0; tick < 120; tick++) world.step();
      const view = world.snapshot();
      const moth = view.moths[0]!;
      expect(moth.respawning).toBe(false);
      const others = view.moths.slice(1);
      expect(isClearSpot(moth.x, moth.z, others)).toBe(true);
    } finally {
      world.destroy();
    }
  });

  it('keeps the fixed slots available for tests', () => {
    expect(fixedPlacement(0, [])).toMatchObject({
      x: ARENA.spawns[0]!.x,
      z: ARENA.spawns[0]!.z,
    });
    expect(fixedPlacement(99, [])).toBeUndefined();
  });

  it('starts every moth a short walk from a lamp, spread across the desk', () => {
    const place = nearLampPlacement(seeded(5));
    const placed: { x: number; y: number; z: number }[] = [];
    const lamps = LAMPS.positions.slice(0, LAMPS.count);
    const used = new Set<number>();
    for (let id = 0; id < ARENA.spawns.length; id++) {
      const spot = place(id, placed)!;
      expect(isClearSpot(spot.x, spot.z, placed)).toBe(true);
      const distances = lamps.map((lamp) =>
        Math.hypot(lamp.x - spot.x, lamp.z - spot.z),
      );
      const nearest = Math.min(...distances);
      expect(nearest).toBeGreaterThan(restingLightRadius());
      expect(nearest).toBeLessThan(restingLightRadius() + 7);
      used.add(distances.indexOf(nearest));
      placed.push(spot);
    }
    expect(used.size).toBeGreaterThanOrEqual(5);
  });
});
