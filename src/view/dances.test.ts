import { describe, expect, it } from 'vitest';
import { DANCE } from '../config';
import { dancePose } from './dances';

const at = (dance: number, part: number) =>
  dancePose(dance, DANCE.seconds * part);

describe('the dance routines', () => {
  it('has a pose for every moment of every routine', () => {
    for (let dance = 1; dance <= DANCE.names.length; dance++)
      for (let step = 0; step <= 200; step++) {
        const pose = at(dance, step / 200);
        const numbers = [
          pose.turn,
          pose.x,
          pose.y,
          pose.z,
          pose.tiltX,
          pose.tiltY,
          pose.tiltZ,
          pose.wings,
          ...pose.armSwing,
          ...pose.armLift,
          ...pose.elbow,
          ...pose.legSwing,
          pose.legSplay,
        ];
        expect(numbers.every(Number.isFinite)).toBe(true);
        // Never far from its spot, nor sunk into the desk.
        expect(pose.y).toBeGreaterThan(-0.2);
        expect(Math.hypot(pose.x, pose.z)).toBeLessThan(0.5);
      }
  });

  it('boxes southpaw: bent-armed guard, right jab, left cross, fist in the air', () => {
    const beat = 1 / 12;
    // Between punches both elbows are well bent, the rear one tighter.
    const guard = at(1, beat * 3.02);
    expect(guard.elbow[1]).toBeGreaterThan(1.2);
    expect(guard.elbow[0]).toBeGreaterThan(guard.elbow[1]);
    // The right leads: a jab straightens that arm and leaves the left tucked.
    const jab = at(1, beat * 0.35);
    expect(jab.elbow[1]).toBeLessThan(0.2);
    expect(jab.armSwing[1]).toBeLessThan(-1.4);
    expect(jab.elbow[0]).toBeGreaterThan(1.8);
    // The cross is the left, with the body turned through behind it.
    const cross = at(1, beat * 2.35);
    expect(cross.elbow[0]).toBeLessThan(0.2);
    expect(cross.elbow[1]).toBeGreaterThan(1.2);
    expect(cross.tiltY).toBeGreaterThan(jab.tiltY + 0.8);
    // The uppercut leaves the desk.
    expect(at(1, beat * 9.5).y).toBeGreaterThan(0.4);
    const pose = at(1, 0.95);
    expect(pose.armSwing[0]).toBeLessThan(-2.5);
    expect(pose.wings).toBeGreaterThan(0.6);
  });

  it('folds up, flaps into the air, turns round and lands flung wide', () => {
    expect(at(2, 0.2).wings).toBeLessThan(0);
    expect(at(2, 0.2).y).toBeLessThan(0);
    const heights = [0.4, 0.5, 0.6].map((part) => at(2, part).y);
    expect(Math.min(...heights)).toBeGreaterThan(0.5);
    // The wings beat through a wide arc while it is up.
    const beats = Array.from({ length: 40 }, (_, n) => at(2, 0.35 + n / 100));
    const spreads = beats.map((pose) => pose.wings);
    expect(Math.max(...spreads) - Math.min(...spreads)).toBeGreaterThan(1.4);
    expect(at(2, 0.52).turn).toBeCloseTo(Math.PI, 1);
    const landed = at(2, 0.95);
    expect(landed.y).toBeLessThan(0.05);
    expect(landed.armLift[0]).toBeGreaterThan(1.2);
    expect(landed.wings).toBeGreaterThan(1.1);
  });

  it('runs, leaps with a half turn and lands the Siuuu', () => {
    expect(at(3, 0.44).y).toBeGreaterThan(0.6);
    // Arms overhead in the air.
    expect(at(3, 0.5).armSwing[0]).toBeLessThan(-2.5);
    const landed = at(3, 0.75);
    expect(landed.turn).toBeCloseTo(Math.PI);
    expect(landed.legSplay).toBeGreaterThan(0.5);
    // Arms thrown down and back, out to the sides, chest out.
    expect(landed.armSwing[0]).toBeGreaterThan(0.4);
    expect(landed.armLift[1]).toBeGreaterThan(0.7);
    expect(landed.tiltX).toBeLessThan(-0.2);
    expect(landed.y).toBeLessThan(0.01);
    // Back to the front by the end.
    expect(at(3, 1).turn).toBeCloseTo(Math.PI * 2);
  });
});
