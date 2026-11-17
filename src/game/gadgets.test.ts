import { describe, expect, it } from 'vitest';
import { BOSH, GUST } from '../config';
import {
  blastImpulse,
  boshTarget,
  gustImpulse,
  launchVelocity,
  pickLamp,
} from './gadgets';

const origin = { x: 0, y: 0.5, z: 0 };
const east = { x: 1, z: 0 };

describe('Wing Gust targeting', () => {
  it('pushes a moth in front away from the attacker and lifts it', () => {
    const push = gustImpulse(origin, east, { x: 2, y: 0.5, z: 0 }, 'moth')!;
    expect(push.x).toBeGreaterThan(0);
    expect(push.y).toBeGreaterThan(0);
    expect(Math.abs(push.z)).toBeLessThan(1e-9);
  });

  it('misses targets behind, beside, out of range, or far below', () => {
    expect(gustImpulse(origin, east, { x: -2, y: 0.5, z: 0 }, 'moth')).toBe(
      undefined,
    );
    expect(gustImpulse(origin, east, { x: 0.5, y: 0.5, z: 2 }, 'moth')).toBe(
      undefined,
    );
    expect(
      gustImpulse(origin, east, { x: GUST.range + 0.1, y: 0.5, z: 0 }, 'moth'),
    ).toBe(undefined);
    expect(
      gustImpulse(
        origin,
        east,
        { x: 1, y: 0.5 - GUST.reachDown - 0.1, z: 0 },
        'moth',
      ),
    ).toBe(undefined);
  });

  it('reaches a lamp hanging overhead and pushes it without lift', () => {
    const push = gustImpulse(origin, east, { x: 2, y: 5, z: 0 }, 'lamp')!;
    expect(push.x).toBeGreaterThan(0);
    expect(push.y).toBe(0);
  });

  it('weakens with distance but never below the edge falloff', () => {
    const near = gustImpulse(origin, east, { x: 0.5, y: 0.5, z: 0 }, 'moth')!;
    const far = gustImpulse(
      origin,
      east,
      { x: GUST.range - 0.01, y: 0.5, z: 0 },
      'moth',
    )!;
    expect(far.x).toBeLessThan(near.x);
    expect(far.x).toBeGreaterThan(GUST.force * GUST.minFalloff * 0.99);
  });

  it('counts the exact cone edge as a hit, matching the preview', () => {
    const angle = GUST.halfAngle - 1e-6;
    const target = { x: Math.cos(angle) * 2, y: 0.5, z: Math.sin(angle) * 2 };
    expect(gustImpulse(origin, east, target, 'moth')).toBeDefined();
  });
});

describe('weapon helpers', () => {
  it('scales launch speed with charge and clamps bad power', () => {
    const low = launchVelocity({ x: 1, y: 0, z: 0 }, 0, 5, 15);
    const high = launchVelocity({ x: 2, y: 0, z: 0 }, 1, 5, 15);
    const wild = launchVelocity({ x: 1, y: 0, z: 0 }, NaN, 5, 15);
    expect(low.x).toBeCloseTo(5);
    expect(high.x).toBeCloseTo(15);
    expect(wild.x).toBeCloseTo(5);
  });

  it('picks the lamp closest to the aim direction, or the one overhead', () => {
    const lamps = [
      { x: 10, y: 5, z: 0 },
      { x: 0, y: 5, z: 10 },
    ];
    expect(pickLamp(origin, { x: 1, y: 0.4, z: 0.1 }, lamps)).toBe(0);
    expect(pickLamp(origin, { x: 0.1, y: 0, z: 1 }, lamps)).toBe(1);
    expect(pickLamp({ x: 0, y: 0.5, z: 10 }, { x: 1, y: 0, z: 0 }, lamps)).toBe(
      1,
    );
    // A near lamp roughly ahead beats a far lamp slightly closer to the aim.
    const row = [
      { x: 0, y: 5, z: 0 },
      { x: 16, y: 5, z: -3 },
    ];
    expect(pickLamp({ x: -2, y: 0.5, z: 1 }, { x: 1, y: 0, z: 0 }, row)).toBe(
      0,
    );
  });

  it('pushes blast targets outwards, weaker with distance, none beyond reach', () => {
    const centre = { x: 0, y: 0.5, z: 0 };
    const near = blastImpulse(centre, { x: 1, y: 0.5, z: 0 }, 3, 10, 4)!;
    const far = blastImpulse(centre, { x: 2.5, y: 0.5, z: 0 }, 3, 10, 4)!;
    expect(near.x).toBeGreaterThan(far.x);
    expect(far.x).toBeGreaterThan(0);
    expect(blastImpulse(centre, { x: 3.1, y: 0.5, z: 0 }, 3, 10, 4)).toBe(
      undefined,
    );
  });
});

describe('Bosh targeting', () => {
  it('picks only the nearest moth in front, within reach', () => {
    const targets = [
      { x: 1.5, y: 0.5, z: 0 },
      { x: 1, y: 0.5, z: 0.2 },
      { x: -1, y: 0.5, z: 0 },
      undefined,
    ];
    expect(boshTarget(origin, east, targets)).toBe(1);
    expect(boshTarget(origin, { x: -1, z: 0 }, targets)).toBe(2);
  });

  it('misses targets out of reach, beside, or far above', () => {
    expect(
      boshTarget(origin, east, [{ x: BOSH.range + 0.1, y: 0.5, z: 0 }]),
    ).toBe(undefined);
    expect(boshTarget(origin, east, [{ x: 0.2, y: 0.5, z: 1.5 }])).toBe(
      undefined,
    );
    expect(
      boshTarget(origin, east, [{ x: 1, y: 0.5 + BOSH.reach + 0.1, z: 0 }]),
    ).toBe(undefined);
    expect(boshTarget(origin, { x: 0, z: 0 }, [{ x: 1, y: 0.5, z: 0 }])).toBe(
      undefined,
    );
  });
});
