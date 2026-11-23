import { describe, expect, it } from 'vitest';
import { classifyTriangle, isWood } from './mothModel';

describe('cutting the wings off the moth model', () => {
  it('tells the wooden body from the painted wings by colour', () => {
    // Sampled from the model's texture: warm wood, cool blue-grey paint.
    expect(isWood(177, 113, 69)).toBe(true);
    expect(isWood(231, 182, 142)).toBe(true);
    expect(isWood(157, 175, 177)).toBe(false);
    // The dark stripe across each wing is paint too.
    expect(isWood(81, 91, 91)).toBe(false);
  });

  const corner = (x: number, z: number, wood: boolean) => ({ x, z, wood });

  it('keeps the body, arms and face with the body', () => {
    // The chest, in front of the wings.
    expect(
      classifyTriangle([
        corner(0.05, 0.1, true),
        corner(0.1, 0.12, true),
        corner(0.08, 0.08, true),
      ]),
    ).toBe(0);
    // A hand, out to the side but wooden and level with the body.
    expect(
      classifyTriangle([
        corner(0.3, 0.02, true),
        corner(0.32, 0.04, true),
        corner(0.31, 0.0, true),
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
});
