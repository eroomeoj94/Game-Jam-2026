import { afterEach, describe, expect, it } from 'vitest';
import { ARENA } from '../config';
import type { GadgetSpec } from '../config';
import { createWorld } from './world';

const worlds: ReturnType<typeof createWorld>[] = [];
afterEach(() => worlds.splice(0).forEach((world) => world.destroy()));
// Clear desk along the front edge.
const FRONT = ARENA.desk.depth / 2 - 3;

function setup(gadgets: GadgetSpec[]) {
  const world = createWorld({ gadgets });
  worlds.push(world);
  return world;
}
const run = (world: ReturnType<typeof createWorld>, ticks: number) => {
  for (let tick = 0; tick < ticks; tick++) world.step();
};
const moth = (world: ReturnType<typeof createWorld>, id: number) =>
  world.snapshot().moths[id]!;
const actions = (world: ReturnType<typeof createWorld>) =>
  world
    .drainEvents()
    .flatMap((event) => (event.type === 'gadget' ? [event.action] : []));

describe('a fan', () => {
  const fan: GadgetSpec = {
    type: 'blower',
    kind: 'fan',
    x: -8,
    z: FRONT,
    radius: 1,
    height: 3.4,
    // Blowing east, along the front of the desk.
    heading: Math.PI / 2,
    sweep: 0,
    sweepSeconds: 1,
    period: 1,
    duty: 1,
    range: 14,
    halfAngle: 0.4,
    force: 120,
  };
  it('blows a standing moth downwind, and leaves one beside the stream alone', () => {
    const world = setup([fan]);
    world.placeMoth(0, { x: -4, y: 0.5, z: FRONT });
    world.placeMoth(1, { x: -8, y: 0.5, z: FRONT - 6 });
    world.selectMoth(2);
    run(world, 90);
    expect(moth(world, 0).x).toBeGreaterThan(-1);
    expect(moth(world, 1).x).toBeCloseTo(-8, 0);
    expect(world.snapshot().gadgets[0]).toMatchObject({
      type: 'blower',
      strength: 1,
    });
  });

  it('only blows for part of the time when it is a kettle', () => {
    const world = setup([{ ...fan, kind: 'kettle', period: 4, duty: 0.25 }]);
    const strengths: number[] = [];
    for (let tick = 0; tick < 240; tick++) {
      world.step();
      const gadget = world.snapshot().gadgets[0]!;
      if (gadget.type === 'blower') strengths.push(gadget.strength);
    }
    expect(Math.max(...strengths)).toBe(1);
    expect(
      strengths.filter((strength) => strength === 0).length,
    ).toBeGreaterThan(120);
  });
});

describe('a toaster', () => {
  it('pops on time and throws whoever is standing on it', () => {
    const world = setup([
      {
        type: 'launcher',
        kind: 'toaster',
        x: 0,
        z: FRONT,
        heading: 0,
        width: 3,
        height: 2.2,
        depth: 1.6,
        period: 2,
        power: 12,
      },
    ]);
    world.placeMoth(0, { x: 0, y: 2.8, z: FRONT });
    world.placeMoth(1, { x: 6, y: 0.5, z: FRONT });
    run(world, 60);
    expect(moth(world, 0).y).toBeCloseTo(2.68, 1);
    expect(actions(world)).toEqual([]);
    let highest = 0;
    for (let tick = 0; tick < 90; tick++) {
      world.step();
      highest = Math.max(highest, moth(world, 0).y);
    }
    expect(actions(world)).toEqual(['pop']);
    expect(highest).toBeGreaterThan(6);
    // Nobody else is bothered.
    expect(moth(world, 1).y).toBeCloseTo(0.48, 1);
  });
});

describe('a see-saw', () => {
  it('throws the moth on the low end when another lands on the high one', () => {
    const world = setup([
      {
        type: 'launcher',
        kind: 'seesaw',
        x: 0,
        z: FRONT - 1,
        heading: 0,
        width: 1.5,
        height: 0.5,
        depth: 4.6,
        period: 0,
        power: 11,
      },
    ]);
    // One stands on the end nearer the edge, which starts down.
    world.placeMoth(0, { x: 0, y: 1.1, z: FRONT - 1 + 1.7 });
    run(world, 40);
    expect(actions(world)).toEqual([]);
    // The other drops onto the raised end from a height.
    world.placeMoth(1, { x: 0, y: 4, z: FRONT - 1 - 1.7 });
    let highest = 0;
    let furthest = 0;
    for (let tick = 0; tick < 200; tick++) {
      world.step();
      if (moth(world, 0).respawning) break;
      highest = Math.max(highest, moth(world, 0).y);
      furthest = Math.max(furthest, moth(world, 0).z);
    }
    expect(actions(world)).toEqual(['flip']);
    expect(highest).toBeGreaterThan(4);
    // Flung on out past its own end: over the edge of the desk.
    expect(furthest).toBeGreaterThan(ARENA.desk.depth / 2);
    expect(world.snapshot().gadgets[0]).toMatchObject({ tilt: -1 });
  });
});

describe('a wind-up toy', () => {
  it('drives its loop and shoves a moth out of the way', () => {
    const world = setup([
      {
        type: 'runner',
        kind: 'car',
        path: [
          { x: -6, z: FRONT },
          { x: 6, z: FRONT },
          { x: 6, z: FRONT - 2 },
          { x: -6, z: FRONT - 2 },
        ],
        speed: 6,
        length: 2.4,
        width: 1.1,
        height: 0.95,
        push: 8,
      },
    ]);
    world.placeMoth(0, { x: 2, y: 0.5, z: FRONT });
    world.selectMoth(1);
    const seen = new Set<number>();
    for (let tick = 0; tick < 150; tick++) {
      world.step();
      const car = world.snapshot().gadgets[0]!;
      if (car.type === 'runner') seen.add(Math.round(car.x));
    }
    expect(seen.size).toBeGreaterThan(8);
    expect(actions(world)).toContain('bump');
    // Knocked along the way the car was going.
    expect(moth(world, 0).x).toBeGreaterThan(3);
  });
});

describe('toy cars sharing a loop', () => {
  it('set off spread round it, without lurching on the first step', () => {
    const path = [
      { x: -6, z: FRONT },
      { x: 6, z: FRONT },
      { x: 6, z: FRONT - 2 },
      { x: -6, z: FRONT - 2 },
    ];
    const world = setup(
      [0, 0.5].map((start) => ({
        type: 'runner' as const,
        kind: 'car' as const,
        path,
        start,
        speed: 6,
        length: 2.4,
        width: 1.1,
        height: 0.95,
        push: 8,
      })),
    );
    const cars = () =>
      world
        .snapshot()
        .gadgets.flatMap((gadget) =>
          gadget.type === 'runner' ? [gadget] : [],
        );
    world.step();
    const [first, second] = cars();
    // Half a lap apart: one on the near straight, one on the far one.
    expect(first!.z).toBeCloseTo(FRONT, 0);
    expect(second!.z).toBeCloseTo(FRONT - 2, 0);
    // And a tick later each has moved a tick's worth, not leapt.
    world.step();
    const [later, laterSecond] = cars();
    expect(Math.abs(later!.x - first!.x)).toBeLessThan(0.5);
    expect(Math.abs(laterSecond!.x - second!.x)).toBeLessThan(0.5);
  });
});

describe('a mug', () => {
  const mug: GadgetSpec = {
    type: 'spill',
    kind: 'mug',
    x: 3,
    z: FRONT,
    radius: 0.9,
    height: 1.9,
    puddle: 3.4,
    color: 0x5a3a22,
  };
  it('stands until a gust tips it, then leaves a puddle that spreads', () => {
    const world = setup([mug]);
    world.placeMoth(0, { x: 0, y: 0.5, z: FRONT });
    run(world, 30);
    expect(world.snapshot().gadgets[0]).toMatchObject({ tipped: false });
    world.useWeapon('gust', { x: 1, y: 0, z: 0 });
    expect(actions(world)).toEqual(['spill']);
    run(world, 120);
    const spilt = world.snapshot().gadgets[0]!;
    if (spilt.type !== 'spill') throw new Error('not a spill');
    expect(spilt.tipped).toBe(true);
    expect(spilt.puddle.radius).toBeCloseTo(3.4);
    // It ran on the way the mug fell: east.
    expect(spilt.puddle.x).toBeGreaterThan(5);
  });

  it('makes the puddle slippery: hard to get going on, and hard to stop', () => {
    const cross = (spilt: boolean) => {
      const world = setup([mug]);
      world.placeMoth(0, { x: 0, y: 0.5, z: FRONT });
      run(world, 20);
      if (spilt) world.useWeapon('gust', { x: 1, y: 0, z: 0 });
      run(world, 120);
      // Beside where the mug fell, in the middle of what it spilt.
      world.placeMoth(0, { x: 5.5, y: 0.5, z: FRONT + 1.6 });
      run(world, 10);
      const start = moth(world, 0).x;
      for (let tick = 0; tick < 25; tick++)
        world.step({ x: 1, z: 0, jump: false, flutter: false });
      const walked = moth(world, 0).x - start;
      // Let go: how long before it has stopped?
      let ticks = 0;
      let last = moth(world, 0).x;
      for (; ticks < 200; ticks++) {
        world.step();
        const now = moth(world, 0).x;
        if (now - last < 1e-4) break;
        last = now;
      }
      return { walked, ticks };
    };
    const dry = cross(false);
    const wet = cross(true);
    expect(wet.walked).toBeLessThan(dry.walked * 0.6);
    expect(wet.ticks).toBeGreaterThan(dry.ticks * 2);
  });
});

describe('a stack', () => {
  const stack: GadgetSpec = {
    type: 'topple',
    kind: 'books',
    x: 2.6,
    z: FRONT,
    width: 3,
    depth: 2.4,
    levels: 4,
    levelHeight: 0.55,
    color: 0x6c5a86,
  };
  it('shrugs off a gust but comes down, book by book, to a punch', () => {
    const world = setup([stack]);
    world.placeMoth(0, { x: 0, y: 0.5, z: FRONT });
    run(world, 30);
    world.useWeapon('gust', { x: 1, y: 0, z: 0 });
    run(world, 60);
    expect(world.snapshot().gadgets[0]).toMatchObject({
      fallen: false,
      parts: [],
    });
    world.useWeapon('bosh', { x: 1, y: 0, z: 0 });
    expect(actions(world)).toContain('topple');
    run(world, 90);
    const fallen = world.snapshot().gadgets[0]!;
    if (fallen.type !== 'topple') throw new Error('not a stack');
    expect(fallen.fallen).toBe(true);
    expect(fallen.parts).toHaveLength(4);
    // Thrown away from the punch, the top book furthest.
    expect(Math.max(...fallen.parts.map((part) => part.x))).toBeGreaterThan(
      3.8,
    );
    expect(Math.max(...fallen.parts.map((part) => part.y))).toBeLessThan(2.2);
  });

  it('takes whoever was standing on it down with it', () => {
    const world = setup([stack]);
    world.placeMoth(0, { x: 0, y: 0.5, z: FRONT });
    world.placeMoth(1, { x: 2.6, y: 2.8, z: FRONT });
    run(world, 40);
    expect(moth(world, 1).y).toBeCloseTo(2.68, 1);
    world.useWeapon('bosh', { x: 1, y: 0, z: 0 });
    run(world, 150);
    // Thrown clear of where the stack stood, or dropped with it.
    const after = moth(world, 1);
    expect(after.x > 4.2 || after.y < 2.2).toBe(true);
  });
});

describe('something that rolls', () => {
  it('lies still until a gust sends it along', () => {
    const world = setup([
      {
        type: 'roller',
        kind: 'pencil',
        x: 3,
        z: FRONT,
        // Lying across the gust.
        heading: 0,
        length: 4,
        radius: 0.3,
      },
    ]);
    world.placeMoth(0, { x: 0, y: 0.5, z: FRONT });
    run(world, 60);
    const before = world.snapshot().gadgets[0]!;
    if (before.type !== 'roller') throw new Error('not a roller');
    expect(before.x).toBeCloseTo(3, 0);
    world.useWeapon('gust', { x: 1, y: 0, z: 0 });
    run(world, 60);
    const after = world.snapshot().gadgets[0]!;
    if (after.type !== 'roller') throw new Error('not a roller');
    expect(after.x).toBeGreaterThan(before.x + 1.5);
    expect(after.present).toBe(true);
  });
});

it('leaves the level alone when contraptions are not asked for', () => {
  const world = createWorld();
  worlds.push(world);
  expect(world.snapshot().gadgets).toEqual([]);
});
