import { describe, expect, it } from 'vitest';
import { buildLevel, DESK, LAMP_SPOTS } from './layout';
import type { TerrainPiece } from './layout';

const footprint = (piece: TerrainPiece) =>
  piece.shape === 'box'
    ? { x: piece.width / 2, z: piece.depth / 2 }
    : { x: piece.radius, z: piece.radius };
const kinds = (level: ReturnType<typeof buildLevel>) =>
  level.gadgets.map(({ type, kind }) => `${type}:${kind}`).sort();

describe('laying out a level', () => {
  it('keeps the original desk, with nothing that moves, when not shuffled', () => {
    const desk = buildLevel('desk');
    expect(desk.gadgets).toEqual([]);
    expect(desk.pits).toEqual([]);
    expect(desk.terrain[0]).toMatchObject({
      kind: 'desk',
      width: DESK.width,
      depth: DESK.depth,
    });
    // Each team's book perch comes straight after the surface.
    expect(desk.terrain[1]).toMatchObject({ kind: 'books' });
    expect(desk.terrain[2]).toMatchObject({ kind: 'books' });
    expect(desk.terrain.filter(({ kind }) => kind === 'desk')).toHaveLength(1);
  });

  it('gives the same layout for the same seed and a new one for another', () => {
    for (const level of ['desk', 'kitchen'] as const) {
      expect(buildLevel(level, 7)).toEqual(buildLevel(level, 7));
      const layouts = new Set(
        [1, 2, 3, 4, 5, 6].map((seed) =>
          JSON.stringify(buildLevel(level, seed).terrain),
        ),
      );
      expect(layouts.size).toBeGreaterThan(3);
    }
  });

  it('moves the desk clusters from lamp to lamp', () => {
    const laptops = new Set(
      Array.from({ length: 12 }, (_, seed) => {
        const laptop = buildLevel('desk', seed + 1).terrain.find(
          ({ kind }) => kind === 'laptop',
        )!;
        return Math.round(laptop.x);
      }),
    );
    expect(laptops.size).toBe(3);
  });

  it('brings the desk to life: fan, see-saw, toy car, pencil, mug and tower', () => {
    expect(kinds(buildLevel('desk', 11))).toEqual([
      'blower:fan',
      'launcher:seesaw',
      'roller:pencil',
      'runner:car',
      'runner:car',
      'runner:car',
      'spill:mug',
      'topple:books',
    ]);
  });

  it('makes the kitchen a worktop with a sink in it', () => {
    const kitchen = buildLevel('kitchen', 11);
    expect(kinds(kitchen)).toEqual([
      'blower:kettle',
      'launcher:toaster',
      'roller:pin',
      'runner:apple',
      'runner:mouse',
      'spill:milk',
      'topple:plates',
    ]);
    const [sink] = kitchen.pits;
    expect(sink).toBeDefined();
    // The worktop is four slabs with the sink left open between them.
    const slabs = kitchen.terrain.filter(({ kind }) => kind === 'desk');
    expect(slabs).toHaveLength(4);
    const area = slabs.reduce(
      (sum, slab) => sum + (slab.shape === 'box' ? slab.width * slab.depth : 0),
      0,
    );
    expect(area).toBeCloseTo(
      DESK.width * DESK.depth - sink!.width * sink!.depth,
    );
    for (const slab of slabs) {
      const half = footprint(slab);
      const overlapX =
        Math.abs(slab.x - sink!.x) < half.x + sink!.width / 2 - 1e-6;
      const overlapZ =
        Math.abs(slab.z - sink!.z) < half.z + sink!.depth / 2 - 1e-6;
      expect(overlapX && overlapZ).toBe(false);
    }
    // Only the board lies across it.
    const over = kitchen.terrain.filter(
      (piece) =>
        piece.kind !== 'desk' &&
        Math.abs(piece.x - sink!.x) < sink!.width / 2 &&
        Math.abs(piece.z - sink!.z) < sink!.depth / 2,
    );
    expect(over.map(({ kind }) => kind)).toEqual(['board']);
    expect(kitchen.terrain.some(({ kind }) => kind === 'kettle')).toBe(false);
  });

  it('keeps the runner’s lane and the lamps clear on every layout', () => {
    for (const level of ['desk', 'kitchen'] as const)
      for (let seed = 1; seed <= 25; seed++) {
        const built = buildLevel(level, seed);
        const runners = built.gadgets.flatMap((gadget) =>
          gadget.type === 'runner' ? [gadget] : [],
        );
        if (!runners.length) throw new Error('no runner');
        const solid = built.terrain.filter(({ kind }) => kind !== 'desk');
        for (const runner of runners)
          for (const point of runner.path)
            for (const piece of solid) {
              const half = footprint(piece);
              const inside =
                Math.abs(point.x - piece.x) < half.x + runner.width / 2 &&
                Math.abs(point.z - piece.z) < half.z + runner.width / 2 &&
                piece.y -
                  (piece.shape === 'box' ? piece.height : piece.height) / 2 <
                  runner.height;
              expect(inside, `${level} ${seed} ${piece.kind}`).toBe(false);
            }
        // Six lamps, as ever, whatever is under them.
        expect(LAMP_SPOTS).toHaveLength(6);
      }
  });
});
