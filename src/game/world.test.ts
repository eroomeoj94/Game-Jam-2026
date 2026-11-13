import { describe, expect, it } from 'vitest';
import { ARENA } from '../config';
import { createWorld } from './world';

describe('3D starter physics world', () => {
  it('swings in both horizontal axes while staying attached to the ceiling', () => {
    const world = createWorld();
    let swingX = 0;
    let swingZ = 0;
    try {
      world.nudgeLamp();
      for (let tick = 0; tick < 600; tick++) {
        world.step();
        const { lamp } = world.snapshot();
        swingX = Math.max(swingX, Math.abs(lamp.x - ARENA.anchor.x));
        swingZ = Math.max(swingZ, Math.abs(lamp.z - ARENA.anchor.z));
        const length = Math.hypot(
          lamp.x - ARENA.anchor.x,
          lamp.y - ARENA.anchor.y,
          lamp.z - ARENA.anchor.z,
        );
        expect(length).toBeGreaterThan(ARENA.tetherLength - 0.05);
        expect(length).toBeLessThan(ARENA.tetherLength + 0.05);
      }
      expect(swingX).toBeGreaterThan(0.5);
      expect(swingZ).toBeGreaterThan(0.2);
    } finally {
      world.destroy();
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
    expect(world.snapshot().lamp.x).not.toBeCloseTo(initial.lamp.x, 1);
    world.destroy();
    const freshWorld = createWorld();
    try {
      expect(freshWorld.snapshot()).toEqual(initial);
    } finally {
      freshWorld.destroy();
    }
  });
});
