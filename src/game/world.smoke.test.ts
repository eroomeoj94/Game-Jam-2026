import { expect, it } from 'vitest';
import { LAMPS } from '../config';
import { createWorld } from './world';

it('survives ten simulated minutes of repeated lamp nudges without invalid or runaway physics', () => {
  const world = createWorld();
  try {
    for (let tick = 0; tick < 60 * 60 * 10; tick++) {
      if (tick % 37 === 0) world.nudgeLamp();
      world.step();
      if (tick % 60 !== 0) continue;
      const { lamps, moths } = world.snapshot();
      for (const position of [...lamps, ...moths]) {
        expect(
          [position.x, position.y, position.z].every(Number.isFinite),
        ).toBe(true);
      }
      for (const lamp of lamps) {
        const distance = Math.hypot(
          lamp.x - lamp.anchor.x,
          lamp.y - lamp.anchor.y,
          lamp.z - lamp.anchor.z,
        );
        expect(Math.abs(distance - LAMPS.tetherLength)).toBeLessThan(0.05);
      }
      for (const moth of moths) {
        expect(moth.y).toBeGreaterThan(0.4);
        expect(moth.y).toBeLessThan(0.6);
      }
    }
  } finally {
    world.destroy();
  }
});
