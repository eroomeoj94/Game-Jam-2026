import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry } from 'three';
import {
  adoptStrays,
  classifyTriangle,
  isWood,
  PARTS,
  splitLimb,
} from './mothModel';

describe('cutting the wings off the moth model', () => {
  it('tells the wooden body from the painted wings by colour', () => {
    // Sampled from the model's texture: warm wood, cool blue-grey paint.
    expect(isWood(177, 113, 69)).toBe(true);
    expect(isWood(231, 182, 142)).toBe(true);
    expect(isWood(157, 175, 177)).toBe(false);
    // The dark stripe across each wing is paint too.
    expect(isWood(81, 91, 91)).toBe(false);
  });

  /** A corner at chest height unless a height is given. */
  const corner = (x: number, z: number, wood: boolean, y = 0.2) => ({
    x,
    y,
    z,
    wood,
  });

  it('keeps the body, arms and face with the body', () => {
    // The chest, in front of the wings.
    expect(
      classifyTriangle([
        corner(0.05, 0.1, true),
        corner(0.1, 0.12, true),
        corner(0.08, 0.08, true),
      ]),
    ).toBe(0);
    // The head is wider than the chest, but it is above the shoulders.
    expect(
      classifyTriangle([
        corner(0.2, 0.02, true, 0.3),
        corner(0.21, 0.04, true, 0.32),
        corner(0.2, 0.0, true, 0.28),
      ]),
    ).toBe(0);
    // A dark eye is not wood-coloured, but it is on the front of the head.
    expect(
      classifyTriangle([
        corner(0.05, 0.14, false),
        corner(0.06, 0.15, false),
        corner(0.04, 0.15, false),
      ]),
    ).toBe(0);
  });

  it('sends painted triangles behind the back to the wing on their side', () => {
    const wing = (side: number) => [
      corner(side * 0.2, -0.14, false),
      corner(side * 0.25, -0.13, false),
      corner(side * 0.22, -0.15, false),
    ];
    expect(classifyTriangle(wing(-1))).toBe(1);
    expect(classifyTriangle(wing(1))).toBe(2);
  });

  it('treats anything far from the spine as wing, whatever its colour', () => {
    // A few wing-tip texels sample as wood at the texture's seams.
    expect(
      classifyTriangle([
        corner(0.67, -0.09, true),
        corner(0.7, -0.1, true),
        corner(0.66, -0.1, false),
      ]),
    ).toBe(2);
  });

  it('leaves a bare wooden hand with its arm, however far out it hangs', () => {
    // As far from the spine as the wings, but all wood and in front of them.
    const hand = [
      corner(-0.36, 0.05, true, -0.42),
      corner(-0.37, 0.05, true, -0.45),
      corner(-0.35, 0.05, true, -0.47),
    ];
    expect(PARTS[classifyTriangle(hand)]).toBe('armLeft');
    // The same wood behind the back is the edge of a wing.
    const edge = hand.map((point) => ({ ...point, z: -0.15 }));
    expect(PARTS[classifyTriangle(edge)]).toBe('wingLeft');
  });

  it('cuts the arms off at the shoulders and the legs at the hips', () => {
    const limb = (x: number, y: number) => [
      corner(x, 0, true, y),
      corner(x + 0.01, 0.01, true, y - 0.02),
      corner(x - 0.01, 0.01, true, y + 0.02),
    ];
    // Hands and forearms hang outside the torso.
    expect(PARTS[classifyTriangle(limb(-0.26, -0.3))]).toBe('armLeft');
    expect(PARTS[classifyTriangle(limb(0.28, -0.3))]).toBe('armRight');
    // The waist between them stays with the body.
    expect(PARTS[classifyTriangle(limb(0.05, -0.3))]).toBe('body');
    // Below the hips each side is a leg, feet included.
    expect(PARTS[classifyTriangle(limb(-0.09, -0.7))]).toBe('legLeft');
    expect(PARTS[classifyTriangle(limb(0.15, -0.7))]).toBe('legRight');
    expect(PARTS[classifyTriangle(limb(-0.2, -0.85))]).toBe('legLeft');
    expect(PARTS[classifyTriangle(limb(0.3, -0.85))]).toBe('legRight');
  });
});

describe('cutting an arm at the elbow', () => {
  it('puts each triangle in the half it sits in, with the elbow at the origin of the lower one', () => {
    // Two triangles of a limb hanging from the origin: one above the cut,
    // one below, the limb a little off to one side.
    const limb = new BufferGeometry();
    limb.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([
          0.1, 0, 0, 0.2, 0, 0, 0.15, -0.16, 0, 0.1, -0.18, 0, 0.2, -0.18, 0,
          0.15, -0.4, 0,
        ]),
        3,
      ),
    );
    limb.setAttribute('uv', new BufferAttribute(new Float32Array(12), 2));
    const { upper, lower, joint } = splitLimb(limb, -0.17);
    expect(upper.getAttribute('position').count).toBe(3);
    expect(lower.getAttribute('position').count).toBe(3);
    expect(lower.getAttribute('uv').count).toBe(3);
    expect(joint.y).toBe(-0.17);
    expect(joint.x).toBeCloseTo(0.15);
    // The lower half hangs from its own joint now.
    expect(lower.getAttribute('position').getY(2)).toBeCloseTo(-0.23);
    expect(lower.getAttribute('position').getX(2)).toBeCloseTo(0);
  });
});

describe('tidying up after the cut', () => {
  /** Unindexed triangles, three corners each, as [x, y, z]. */
  const mesh = (triangles: number[][][]) => {
    const flat = triangles.flat();
    return {
      count: flat.length,
      getX: (index: number) => flat[index]![0]!,
      getY: (index: number) => flat[index]![1]!,
      getZ: (index: number) => flat[index]![2]!,
    };
  };
  /** A strip of `count` joined triangles starting at (x, y), at depth z. */
  const strip = (x: number, y: number, z: number, count: number) =>
    Array.from({ length: count }, (_, step) => [
      [x + step * 0.01, y, z],
      [x + (step + 1) * 0.01, y, z],
      [x + step * 0.01, y + 0.01, z],
    ]);

  it('gives scraps of body stranded behind the back to the wing they lie in', () => {
    const body = strip(0, 0, 0.05, 20);
    const scrapLeft = strip(-0.3, -0.2, -0.15, 2);
    const scrapRight = strip(0.3, -0.2, -0.15, 2);
    // A separate piece in front of the back is left alone: it is not wing.
    const button = strip(0, 0.3, 0.1, 2);
    const kinds = [
      ...body.map(() => 0),
      ...scrapLeft.map(() => 0),
      ...scrapRight.map(() => 0),
      ...button.map(() => 0),
    ];
    const moved = adoptStrays(
      kinds,
      mesh([...body, ...scrapLeft, ...scrapRight, ...button]),
    );
    expect(moved).toBe(4);
    expect(kinds.slice(0, 20).every((kind) => kind === 0)).toBe(true);
    expect(kinds.slice(20, 22)).toEqual([1, 1]);
    expect(kinds.slice(22, 24)).toEqual([2, 2]);
    expect(kinds.slice(24)).toEqual([0, 0]);
  });

  it('hands small unpainted islands of wing back to the limb they sit in', () => {
    const wing = strip(-0.9, 0.3, -0.15, 100);
    // Dark scraps down by the hips that sorted as wing.
    const scrap = strip(-0.1, -0.7, -0.15, 2);
    const kinds = [...wing.map(() => 1), ...scrap.map(() => 1)];
    const painted = [...wing.map(() => true), ...scrap.map(() => false)];
    adoptStrays(kinds, mesh([...wing, ...scrap]), -0.06, painted);
    expect(kinds.slice(0, 100).every((kind) => kind === 1)).toBe(true);
    expect(kinds.slice(100).map((kind) => PARTS[kind])).toEqual([
      'legLeft',
      'legLeft',
    ]);
    // A small island that is painted like a wing stays one.
    const chip = strip(-0.5, -0.3, -0.15, 2);
    const again = [...wing.map(() => 1), ...chip.map(() => 1)];
    adoptStrays(
      again,
      mesh([...wing, ...chip]),
      -0.06,
      again.map(() => true),
    );
    expect(again.every((kind) => kind === 1)).toBe(true);
  });
});
