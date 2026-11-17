import { afterEach, describe, expect, it } from 'vitest';
import { ARENA, LAMPS } from '../config';
import { createWorld } from './world';
import type { MovementCommand } from './world';

const worlds: ReturnType<typeof createWorld>[] = [];
const idle: MovementCommand = { x: 0, z: 0, jump: false, flutter: false };
function setup() {
  const world = createWorld();
  worlds.push(world);
  for (let tick = 0; tick < 30; tick++) world.step();
  return world;
}
function advance(
  world: ReturnType<typeof createWorld>,
  ticks: number,
  command = idle,
) {
  for (let tick = 0; tick < ticks; tick++) world.step(command);
}
afterEach(() => {
  worlds.splice(0).forEach((world) => world.destroy());
});

describe('moth movement', () => {
  it('moves only the selected moth and brakes when movement is released', () => {
    const world = setup();
    world.selectMoth(1);
    const start = world.snapshot();
    advance(world, 30, { ...idle, x: -1 });
    expect(world.snapshot().moths[1]!.x).toBeLessThan(start.moths[1]!.x - 1);
    expect(world.snapshot().moths[0]!.x).toBe(start.moths[0]!.x);
    advance(world, 30);
    const stopped = world.snapshot().moths[1]!;
    advance(world, 30);
    expect(world.snapshot().moths[1]!.x).toBeCloseTo(stopped.x, 3);
    expect(world.snapshot().moths[1]!.moving).toBe(false);
    expect(world.selectMoth(42)).toBe(false);
    expect(world.snapshot().selectedMoth).toBe(1);
  });

  it('normalizes diagonal motion so it is no faster than straight movement', () => {
    const straight = setup();
    const diagonal = setup();
    advance(straight, 25, { ...idle, x: 1 });
    advance(diagonal, 25, { ...idle, x: 1, z: 1 });
    const a = straight.snapshot().moths[0]!;
    const b = diagonal.snapshot().moths[0]!;
    const origin = ARENA.spawns[0]!;
    expect(Math.hypot(b.x - origin.x, b.z - origin.z)).toBeCloseTo(
      a.x - origin.x,
      2,
    );
  });

  it('supports analog walking rather than treating a partial stick as full speed', () => {
    const full = setup();
    const partial = setup();
    advance(full, 30, { ...idle, x: 1 });
    advance(partial, 30, { ...idle, x: 0.5 });
    const fullDistance = full.snapshot().moths[0]!.x - ARENA.spawns[0]!.x;
    const partialDistance = partial.snapshot().moths[0]!.x - ARENA.spawns[0]!.x;
    expect(partialDistance).toBeGreaterThan(0.3);
    expect(partialDistance).toBeLessThan(fullDistance * 0.65);
  });

  it('jumps from the ground but ignores additional midair jumps', () => {
    const normal = setup();
    const repeated = setup();
    normal.step({ ...idle, jump: true });
    repeated.step({ ...idle, jump: true });
    advance(normal, 25);
    advance(repeated, 25, { ...idle, jump: true });
    expect(repeated.snapshot().moths[0]!.y).toBeGreaterThan(1.5);
    expect(repeated.snapshot().moths[0]!.y).toBeCloseTo(
      normal.snapshot().moths[0]!.y,
      6,
    );
  });

  it.each([0, 1])('lets moth %i hop onto its nearby book platform', (id) => {
    const world = setup();
    world.selectMoth(id);
    const platform = ARENA.terrain[id + 1]!;
    // Hop, then steer towards the middle of the book as a player would. Air
    // momentum carries a moth past small books if it keeps holding forward.
    world.step({ ...idle, jump: true });
    advance(world, 8);
    let landed = false;
    for (let tick = 0; tick < 120; tick++) {
      const moth = world.snapshot().moths[id]!;
      const dx = platform.x - moth.x;
      const dz = platform.z - moth.z;
      const distance = Math.hypot(dx, dz);
      const strength = Math.min(1, distance * 2) / (distance || 1);
      world.step({ ...idle, x: dx * strength, z: dz * strength });
      if (world.snapshot().moths[id]!.grounded) {
        landed = true;
        break;
      }
    }
    expect(landed).toBe(true);
    advance(world, 12);
    const moth = world.snapshot().moths[id]!;
    expect(moth.y).toBeCloseTo(
      platform.y + platform.height / 2 + ARENA.mothRadius,
      1,
    );
    expect(moth.grounded).toBe(true);
  });

  it('cannot walk through book sides or use a side collision as a jump surface', () => {
    const world = setup();
    advance(world, 80, { ...idle, z: -1 });
    const moth = world.snapshot().moths[0]!;
    // The perch's near side is 1.1 in front of the spawn.
    expect(moth.z).toBeGreaterThan(ARENA.spawns[0]!.z - 1.1);
    expect(moth.y).toBeLessThan(0.55);
  });

  it('runs out of flutter in the air, falls, and refills only after landing', () => {
    const world = setup();
    world.step({ ...idle, jump: true });
    advance(world, 60, { ...idle, flutter: true });
    const exhausted = world.snapshot().moths[0]!;
    expect(exhausted.flutter).toBe(0);
    expect(exhausted.grounded).toBe(false);
    expect(exhausted.fluttering).toBe(false);
    let landed = false;
    for (let tick = 0; tick < 240; tick++) {
      world.step({ ...idle, flutter: true });
      const moth = world.snapshot().moths[0]!;
      if (moth.grounded) {
        landed = true;
        break;
      }
      expect(moth.flutter).toBe(0);
    }
    expect(landed).toBe(true);
    expect(world.snapshot().moths[0]!.flutter).toBe(1);
    advance(world, 60, { ...idle, flutter: true });
    expect(world.snapshot().moths[0]!.grounded).toBe(true);
  });

  it('recovers from a desk fall with a fresh flutter reserve', () => {
    const world = setup();
    // Start a few steps from the front edge of the large desk.
    world.placeMoth(0, { x: 0, y: 0.5, z: ARENA.desk.depth / 2 - 2 });
    let fell = false;
    for (let tick = 0; tick < 300; tick++) {
      world.step({ ...idle, z: 1 });
      if (world.snapshot().moths[0]!.respawning) {
        fell = true;
        break;
      }
    }
    expect(fell).toBe(true);
    expect(world.selectMoth(0)).toBe(false);
    advance(world, 90);
    const moth = world.snapshot().moths[0]!;
    expect(moth.respawning).toBe(false);
    expect(moth.grounded).toBe(true);
    expect(moth.x).toBeCloseTo(ARENA.spawns[0]!.x, 2);
    expect(moth.z).toBeCloseTo(ARENA.spawns[0]!.z, 2);
    expect(moth.flutter).toBe(1);
  });

  it('slows down in the air once movement is released, so hops can be aimed', () => {
    const held = setup();
    const released = setup();
    for (const world of [held, released]) {
      advance(world, 20, { ...idle, x: 1 });
      world.step({ ...idle, x: 1, jump: true });
    }
    advance(held, 25, { ...idle, x: 1 });
    advance(released, 25);
    const start = ARENA.spawns[0]!.x;
    const heldDistance = held.snapshot().moths[0]!.x - start;
    const releasedDistance = released.snapshot().moths[0]!.x - start;
    expect(released.snapshot().moths[0]!.grounded).toBe(false);
    expect(releasedDistance).toBeLessThan(heldDistance - 1);
  });

  it('starts each moth facing its nearest lamp', () => {
    const world = setup();
    world.snapshot().moths.forEach((moth) => {
      const nearest = LAMPS.positions
        .slice(0, LAMPS.count)
        .reduce((best, lamp) =>
          Math.hypot(lamp.x - moth.x, lamp.z - moth.z) <
          Math.hypot(best.x - moth.x, best.z - moth.z)
            ? lamp
            : best,
        );
      const facing = { x: Math.sin(moth.heading), z: Math.cos(moth.heading) };
      const towards = { x: nearest.x - moth.x, z: nearest.z - moth.z };
      const length = Math.hypot(towards.x, towards.z);
      expect(
        (facing.x * towards.x + facing.z * towards.z) / length,
      ).toBeGreaterThan(0.99);
    });
  });
});
