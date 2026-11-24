import { expect, it } from 'vitest';
import { GIANT_CUTS, GIANT_PARTS, giantPart } from './giantModel';

const name = (cut: number, x: number, y: number) =>
  GIANT_PARTS[giantPart(GIANT_CUTS[cut]!, x, y)];

it('cuts every giant into a body, two arms and two legs', () => {
  GIANT_CUTS.forEach((cut, index) => {
    // The head and the chest stay with the body.
    expect(name(index, 0, 0.7)).toBe('body');
    expect(name(index, 0, cut.shoulder.y - 0.1)).toBe('body');
    // A hand hanging at each side belongs to that side's arm.
    const hand = cut.armBottom + 0.06;
    const out = cut.armIn + cut.armSplay * (cut.armFlare - hand) + 0.05;
    expect(name(index, -out, hand)).toBe('armRight');
    expect(name(index, out, hand)).toBe('armLeft');
    // The feet belong to the legs, split down the middle.
    expect(name(index, -0.15, -0.9)).toBe('legRight');
    expect(name(index, 0.15, -0.9)).toBe('legLeft');
  });
});

it('keeps the shoulders and hips with the body', () => {
  GIANT_CUTS.forEach((cut, index) => {
    expect(name(index, cut.shoulder.x + 0.1, cut.armTop + 0.05)).toBe('body');
    expect(name(index, 0.1, cut.legTop + 0.05)).toBe('body');
  });
});
