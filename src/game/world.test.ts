import { describe, expect, it } from 'vitest';
import { ARENA, LAMPS } from '../config';
import { createWorld } from './world';

describe('3D starter physics world', () => {
  it('swings every lamp in both horizontal axes while staying attached', () => {
    const world = createWorld();
    const swing = world.snapshot().lamps.map(() => ({ x: 0, z: 0 }));
    try {
      world.nudgeLamp();
      for (let tick = 0; tick < 600; tick++) {
        world.step();
        world.snapshot().lamps.forEach((lamp, index) => {
          const { anchor } = lamp;
          swing[index]!.x = Math.max(
            swing[index]!.x,
            Math.abs(lamp.x - anchor.x),
          );
          swing[index]!.z = Math.max(
            swing[index]!.z,
            Math.abs(lamp.z - anchor.z),
          );
          const length = Math.hypot(
            lamp.x - anchor.x,
            lamp.y - anchor.y,
            lamp.z - anchor.z,
          );
          expect(length).toBeGreaterThan(LAMPS.tetherLength - 0.05);
          expect(length).toBeLessThan(LAMPS.tetherLength + 0.05);
        });
      }
      // Each lamp is pushed a different way; every one must swing visibly.
      for (const { x, z } of swing) expect(Math.hypot(x, z)).toBeGreaterThan(1);
      expect(Math.max(...swing.map(({ x }) => x))).toBeGreaterThan(0.5);
      expect(Math.max(...swing.map(({ z }) => z))).toBeGreaterThan(0.5);
    } finally {
      world.destroy();
    }
  });

  it('hangs one lamp per configured position, rebuilt from the current settings', () => {
    const count = LAMPS.count;
    try {
      LAMPS.count = 2;
      const world = createWorld();
      const { lamps } = world.snapshot();
      expect(lamps).toHaveLength(2);
      expect(lamps[1]!.anchor.x).toBe(LAMPS.positions[1]!.x);
      expect(lamps[1]!.anchor.y).toBe(LAMPS.anchorHeight);
      world.destroy();
    } finally {
      LAMPS.count = count;
    }
  });

  it('supports both moths on the desk against gravity', () => {
    const world = createWorld();
    try {
      for (let tick = 0; tick < 300; tick++) world.step();
      const { moths } = world.snapshot();
      expect(moths).toHaveLength(2);
      moths.forEach((moth, index) => {
        expect(moth.y).toBeCloseTo(ARENA.mothRadius, 2);
        expect(moth.x).toBeCloseTo(ARENA.spawns[index]!.x, 2);
        expect(moth.z).toBeCloseTo(ARENA.spawns[index]!.z, 2);
      });
    } finally {
      world.destroy();
    }
  });

  it('starts a fresh independent simulation when the scene is reset', () => {
    const world = createWorld();
    const initial = world.snapshot();
    world.nudgeLamp();
    for (let tick = 0; tick < 30; tick++) world.step();
    expect(world.snapshot().lamps[0]!.x).not.toBeCloseTo(
      initial.lamps[0]!.x,
      1,
    );
    world.destroy();
    const freshWorld = createWorld();
    try {
      expect(freshWorld.snapshot()).toEqual(initial);
    } finally {
      freshWorld.destroy();
    }
  });
});
