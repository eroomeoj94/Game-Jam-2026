import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry } from 'three';
import { classifyTriangle, isWood, PARTS, splitLimb } from './mothModel';

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
