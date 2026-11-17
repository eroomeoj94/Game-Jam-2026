import { afterEach, describe, expect, it } from 'vitest';
import { ARENA, FIRECRACKER, LAMPS, PLAYGROUND, ZAP } from '../config';
import { createWorld } from './world';

const worlds: ReturnType<typeof createWorld>[] = [];
function setup() {
  const world = createWorld();
  worlds.push(world);
  return world;
}
function advance(world: ReturnType<typeof createWorld>, ticks: number) {
  for (let tick = 0; tick < ticks; tick++) world.step();
}
function cooldown(world: ReturnType<typeof createWorld>) {
  advance(world, Math.ceil(PLAYGROUND.cooldown * 60) + 1);
}
const east = { x: 1, y: 0, z: 0 };
// Clear desk space along the front edge, kept free of props for tests.
const FRONT = ARENA.desk.depth / 2 - 3;
afterEach(() => {
  worlds.splice(0).forEach((world) => world.destroy());
});

describe('Wing Gust', () => {
  it('knocks an enemy moth away and leaves moths outside the cone alone', () => {
    const world = setup();
    world.placeMoth(0, { x: 0, y: 0.5, z: FRONT });
    world.placeMoth(1, { x: 2, y: 0.5, z: FRONT });
    advance(world, 30);
    const before = world.snapshot().moths[1]!;
    expect(world.useWeapon('gust', { x: -1, y: 0, z: 0 })).toBe(true);
    cooldown(world);
    expect(world.snapshot().moths[1]!.x).toBeCloseTo(before.x, 2);
    world.drainEvents();
    expect(world.useWeapon('gust', east)).toBe(true);
    expect(world.drainEvents().map((event) => event.type)).toEqual([
      'hit',
      'gust',
    ]);
    expect(world.snapshot().moths[1]!.staggered).toBe(true);
    advance(world, 60);
    expect(world.snapshot().moths[1]!.x).toBeGreaterThan(before.x + 2);
  });

  it('swings a lamp overhead', () => {
    const world = setup();
    const lamp = world.snapshot().lamps[0]!;
    world.placeMoth(0, { x: lamp.x - 1.5, y: 0.5, z: lamp.z });
    advance(world, 30);
    world.useWeapon('gust', east);
    let swing = 0;
    for (let tick = 0; tick < 60; tick++) {
      world.step();
      swing = Math.max(swing, world.snapshot().lamps[0]!.x - lamp.anchor.x);
    }
    expect(swing).toBeGreaterThan(0.8);
  });

  it('can knock a moth off the edge of the desk', () => {
    const world = setup();
    const edge = ARENA.desk.width / 2;
    world.placeMoth(0, { x: edge - 3, y: 0.5, z: FRONT });
    world.placeMoth(1, { x: edge - 1.2, y: 0.5, z: FRONT });
    advance(world, 30);
    world.useWeapon('gust', east);
    let fell = false;
    for (let tick = 0; tick < 240 && !fell; tick++) {
      world.step();
      fell = world.snapshot().moths[1]!.respawning;
    }
    expect(fell).toBe(true);
  });
});

describe('Bosh', () => {
  it('punches only the nearest moth in front, much harder than a gust', () => {
    const boshed = setup();
    const gusted = setup();
    for (const world of [boshed, gusted]) {
      world.placeMoth(0, { x: 0, y: 0.5, z: FRONT });
      world.placeMoth(1, { x: 1.3, y: 0.5, z: FRONT });
      advance(world, 30);
      world.drainEvents();
    }
    expect(boshed.useWeapon('bosh', east)).toBe(true);
    gusted.useWeapon('gust', east);
    expect(boshed.snapshot().moths[0]!.punching).toBe(true);
    const bosh = boshed.drainEvents().find((event) => event.type === 'bosh');
    expect(bosh).toMatchObject({ type: 'bosh', moth: 1 });
    advance(boshed, 40);
    advance(gusted, 40);
    expect(boshed.snapshot().moths[1]!.x).toBeGreaterThan(
      gusted.snapshot().moths[1]!.x + 1,
    );
    expect(boshed.snapshot().moths[0]!.punching).toBe(false);
  });

  it('swings at thin air when nobody is in reach', () => {
    const world = setup();
    world.placeMoth(0, { x: 0, y: 0.5, z: FRONT });
    world.placeMoth(1, { x: 4, y: 0.5, z: FRONT });
    advance(world, 30);
    world.drainEvents();
    expect(world.useWeapon('bosh', east)).toBe(true);
    const bosh = world.drainEvents().find((event) => event.type === 'bosh');
    expect(bosh).toMatchObject({ type: 'bosh', moth: undefined });
    advance(world, 30);
    expect(world.snapshot().moths[1]!.x).toBeCloseTo(4, 1);
  });
});

describe('weapon playground rules', () => {
  it('waits for the cooldown and rejects invalid aims', () => {
    const world = setup();
    expect(world.useWeapon('gust', east)).toBe(true);
    expect(world.snapshot().weaponCooldown).toBe(1);
    expect(world.useWeapon('cap', east)).toBe(false);
    cooldown(world);
    expect(world.snapshot().weaponCooldown).toBe(0);
    expect(world.useWeapon('gust', { x: 0, y: 0, z: 0 })).toBe(false);
    expect(world.useWeapon('gust', { x: NaN, y: 0, z: 0 })).toBe(false);
    expect(world.useWeapon('gust', east)).toBe(true);
  });
});

describe('Zap Switch', () => {
  it('targets the lamp nearest the aim and zaps every moth in its light', () => {
    const world = setup();
    const lamp = world.snapshot().lamps[0]!;
    // The attacker stands in the light too: zappers hit both teams.
    world.placeMoth(0, { x: lamp.x - 2, y: 0.5, z: lamp.z + 1 });
    world.placeMoth(1, { x: lamp.x + 1, y: 0.5, z: lamp.z + 1 });
    advance(world, 30);
    const aim = { x: 1, y: 0, z: 0 };
    expect(world.zapTarget(aim)).toBe(0);
    world.drainEvents();
    expect(world.useWeapon('zap', aim)).toBe(true);
    const view = world.snapshot();
    expect(view.lamps[0]!.zapper).toBe(true);
    expect(view.teamZaps).toEqual([1, 1]);
    expect(view.moths.slice(0, 2).every((moth) => moth.zapped)).toBe(true);
    const types = world.drainEvents().map((event) => event.type);
    expect(types).toContain('lamp');
    expect(types.filter((type) => type === 'zap')).toHaveLength(2);
  });

  it('launches a zapped moth away and returns it to base', () => {
    const world = setup();
    const lamp = world.snapshot().lamps[0]!;
    world.placeMoth(1, { x: lamp.x + 1, y: 0.5, z: lamp.z });
    advance(world, 30);
    world.placeMoth(0, { x: lamp.x - 12, y: 0.5, z: lamp.z + 8 });
    world.useWeapon('zap', {
      x: lamp.x - (lamp.x - 12),
      y: 0,
      z: lamp.z - (lamp.z + 8),
    });
    advance(world, 10);
    const flying = world.snapshot().moths[1]!;
    expect(flying.zapped).toBe(true);
    expect(flying.y).toBeGreaterThan(1);
    expect(flying.x).toBeGreaterThan(lamp.x + 1);
    advance(world, Math.ceil((ZAP.flightTime + 1) * 60));
    const home = world.snapshot().moths[1]!;
    expect(home.zapped).toBe(false);
    expect(home.respawning).toBe(false);
    expect(
      Math.hypot(home.x - ARENA.spawns[1]!.x, home.z - ARENA.spawns[1]!.z),
    ).toBeLessThan(1.6);
    // Zapped once only, despite starting the flight inside the light.
    expect(world.snapshot().teamZaps).toEqual([0, 1]);
  });

  it('zaps a moth pushed into its light, then turns back into a warm lamp', () => {
    const world = setup();
    const lamp = world.snapshot().lamps[0]!;
    const edge = LAMPS.haloRadius;
    // Just outside the light, with the attacker behind.
    world.placeMoth(0, { x: lamp.x + edge + 2.5, y: 0.5, z: lamp.z });
    world.placeMoth(1, { x: lamp.x + edge + 1, y: 0.5, z: lamp.z });
    advance(world, 30);
    world.useWeapon('zap', { x: -1, y: 0, z: 0 });
    expect(world.snapshot().teamZaps).toEqual([0, 0]);
    cooldown(world);
    world.useWeapon('gust', { x: -1, y: 0, z: 0 });
    let zapped = false;
    for (let tick = 0; tick < 90 && !zapped; tick++) {
      world.step();
      zapped = world.snapshot().moths[1]!.zapped;
    }
    expect(zapped).toBe(true);
    expect(world.snapshot().teamZaps).toEqual([0, 1]);
    advance(world, Math.ceil(ZAP.duration * 60) + 1);
    expect(world.snapshot().lamps[0]!.zapper).toBe(false);
  });
});

describe('projectiles', () => {
  it('a bottle cap knocks back the moth it hits, then disappears', () => {
    const world = setup();
    world.placeMoth(0, { x: 0, y: 0.5, z: FRONT });
    world.placeMoth(1, { x: 4, y: 0.5, z: FRONT });
    advance(world, 30);
    const before = world.snapshot().moths[1]!;
    world.drainEvents();
    expect(world.useWeapon('cap', { x: 1, y: 0.02, z: 0 }, 1)).toBe(true);
    expect(world.snapshot().projectiles).toHaveLength(1);
    advance(world, 60);
    expect(world.drainEvents().some((event) => event.type === 'hit')).toBe(
      true,
    );
    expect(world.snapshot().moths[1]!.x).toBeGreaterThan(before.x + 1.5);
    advance(world, 240);
    expect(world.snapshot().projectiles).toHaveLength(0);
  });

  it('a firecracker explodes after its fuse, pushing moths on both teams', () => {
    const world = setup();
    world.placeMoth(0, { x: 0, y: 0.5, z: FRONT });
    world.placeMoth(1, { x: 3, y: 0.5, z: FRONT });
    advance(world, 30);
    world.useWeapon('firecracker', { x: 1, y: 0.3, z: 0 }, 0);
    world.drainEvents();
    advance(world, Math.ceil(FIRECRACKER.fuse * 60) - 2);
    expect(world.snapshot().projectiles).toHaveLength(1);
    expect(world.snapshot().projectiles[0]!.fuse).toBeGreaterThan(0);
    advance(world, 4);
    expect(world.snapshot().projectiles).toHaveLength(0);
    const events = world.drainEvents();
    expect(events.some((event) => event.type === 'explode')).toBe(true);
    const hits = events.filter((event) => event.type === 'hit');
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});
