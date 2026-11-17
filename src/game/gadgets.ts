import { BOSH, GUST } from '../config';
import type { Position } from './world';

export type Direction = Readonly<{ x: number; z: number }>;
export type Impulse = Readonly<{ x: number; y: number; z: number }>;

/**
 * Wing Gust targeting, shared by the world, the aiming preview and (later)
 * the bot so they cannot disagree.
 *
 * The gust is a horizontal wedge: a target is hit when it lies within
 * `range` across the desk, within `halfAngle` of the aim, and between a
 * little below the attacker and `reachUp` above it, so a gust can swing a
 * lamp hanging overhead. The push weakens linearly with distance down to
 * `minFalloff` at the edge of the range.
 */
export function gustImpulse(
  origin: Position,
  aim: Direction,
  target: Position,
  kind: 'moth' | 'lamp',
): Impulse | undefined {
  const aimLength = Math.hypot(aim.x, aim.z);
  if (aimLength < 1e-6) return;
  const ax = aim.x / aimLength;
  const az = aim.z / aimLength;
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const dy = target.y - origin.y;
  const distance = Math.hypot(dx, dz);
  if (distance > GUST.range || dy < -GUST.reachDown || dy > GUST.reachUp)
    return;
  // Point-blank targets are always in the cone.
  if (distance > 0.05) {
    const cosine = (dx * ax + dz * az) / distance;
    if (cosine < Math.cos(GUST.halfAngle)) return;
  }
  const falloff =
    1 - (1 - GUST.minFalloff) * Math.min(1, distance / GUST.range);
  // Push along the line from attacker to target, biased towards the aim so
  // targets at the cone's edge are not shoved sideways too hard.
  let px = ax;
  let pz = az;
  if (distance > 0.05) {
    px = ax * 0.5 + (dx / distance) * 0.5;
    pz = az * 0.5 + (dz / distance) * 0.5;
    const length = Math.hypot(px, pz) || 1;
    px /= length;
    pz /= length;
  }
  const force = (kind === 'moth' ? GUST.force : GUST.lampForce) * falloff;
  return {
    x: px * force,
    y: kind === 'moth' ? GUST.lift * falloff : 0,
    z: pz * force,
  };
}

export type Aim = Readonly<{ x: number; y: number; z: number }>;

/** Lamp-picking penalty per unit of distance (see `pickLamp`). */
const NEARER_LAMP_BIAS = 0.012;

/** Unit horizontal direction of a 3D aim; undefined when aiming straight up. */
export function horizontal(aim: Aim): Direction | undefined {
  const length = Math.hypot(aim.x, aim.z);
  return length < 1e-6 ? undefined : { x: aim.x / length, z: aim.z / length };
}

/** Projectile launch velocity: speed grows with charged `power` (0 to 1). */
export function launchVelocity(
  aim: Aim,
  power: number,
  minSpeed: number,
  maxSpeed: number,
): Impulse {
  const length = Math.hypot(aim.x, aim.y, aim.z) || 1;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(power) ? power : 0));
  const speed = minSpeed + (maxSpeed - minSpeed) * clamped;
  return {
    x: (aim.x / length) * speed,
    y: (aim.y / length) * speed,
    z: (aim.z / length) * speed,
  };
}

/**
 * The lamp a Zap Switch would flip: the one best lined up with the aim
 * across the desk (height is ignored, so aiming at a lamp's light works
 * too). Among lamps in a similar direction the nearer one wins, so a
 * distant lamp a few degrees closer to the aim does not steal the target.
 */
export function pickLamp(
  origin: Position,
  aim: Aim,
  lamps: readonly Position[],
): number | undefined {
  const direction = horizontal(aim);
  if (!direction) return;
  let best: number | undefined;
  let bestScore = -Infinity;
  lamps.forEach((lamp, index) => {
    const dx = lamp.x - origin.x;
    const dz = lamp.z - origin.z;
    const distance = Math.hypot(dx, dz);
    // Standing under a lamp always targets it.
    const score =
      distance < 0.5
        ? 2
        : (dx * direction.x + dz * direction.z) / distance -
          distance * NEARER_LAMP_BIAS;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

/** Radial push from a blast, weakening to nothing at `radius`. */
export function blastImpulse(
  centre: Position,
  target: Position,
  radius: number,
  force: number,
  lift: number,
): Impulse | undefined {
  const dx = target.x - centre.x;
  const dy = target.y - centre.y;
  const dz = target.z - centre.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance > radius) return;
  const falloff = 1 - distance / radius;
  const flat = Math.hypot(dx, dz);
  // Directly on top of the blast: just launch upwards.
  const px = flat < 1e-3 ? 0 : dx / flat;
  const pz = flat < 1e-3 ? 0 : dz / flat;
  return {
    x: px * force * falloff,
    y: lift * falloff,
    z: pz * force * falloff,
  };
}

/**
 * Bosh targeting: the single nearest target in front of the attacker,
 * within reach and the punch's arc. Returns its index, or undefined.
 */
export function boshTarget(
  origin: Position,
  aim: Direction,
  targets: readonly (Position | undefined)[],
): number | undefined {
  const length = Math.hypot(aim.x, aim.z);
  if (length < 1e-6) return;
  const ax = aim.x / length;
  const az = aim.z / length;
  let best: number | undefined;
  let bestDistance = Infinity;
  targets.forEach((target, index) => {
    if (!target) return;
    const dx = target.x - origin.x;
    const dz = target.z - origin.z;
    const distance = Math.hypot(dx, dz);
    if (distance > BOSH.range || Math.abs(target.y - origin.y) > BOSH.reach)
      return;
    if (
      distance > 0.05 &&
      (dx * ax + dz * az) / distance < Math.cos(BOSH.halfAngle)
    )
      return;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}
