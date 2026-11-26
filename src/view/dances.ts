import { DANCE } from '../config';

/**
 * Where a dancing moth's body, wings and limbs are at one moment of a
 * routine. Angles are radians; negative swings bring a limb forwards.
 */
export type DancePose = {
  /** Added to the moth's heading: the whole figure turning on the spot. */
  turn: number;
  /** The body's shift from where the moth stands. */
  x: number;
  y: number;
  z: number;
  /** The body's lean: forwards, twist and sideways. */
  tiltX: number;
  tiltY: number;
  tiltZ: number;
  /** How far open the wings are. */
  wings: number;
  /** Left and right arm, swung forwards (negative) or back. */
  armSwing: [number, number];
  /** Left and right arm, lifted out to the side. */
  armLift: [number, number];
  legSwing: [number, number];
  /** Both legs spread apart. */
  legSplay: number;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));
/** Ease in and out between 0 and 1. */
const ease = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const mix = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;
const TURN = Math.PI * 2;

const still = (): DancePose => ({
  turn: 0,
  x: 0,
  y: 0,
  z: 0,
  tiltX: 0,
  tiltY: 0,
  tiltZ: 0,
  wings: 0.22,
  armSwing: [0, 0],
  armLift: [0, 0],
  legSwing: [0, 0],
  legSplay: 0,
});

/** Fists up in front of the face. */
const GUARD = -1.15;
/** One move to a beat: jabs, ducks, then a wound-up spinning uppercut. */
const COMBO = [
  'left',
  'right',
  'left',
  'duck',
  'right',
  'left',
  'right',
  'duck',
  'wind',
  'upper',
  'pose',
  'pose',
] as const;

/**
 * Shadow Boxing: bouncing on its toes behind a guard, a combination of
 * jabs and ducks, then an uppercut that lifts it off the desk in a spin and
 * a fist held high.
 */
function shadowBoxing(time: number): DancePose {
  const pose = still();
  const beat = DANCE.seconds / COMBO.length;
  const index = Math.min(COMBO.length - 1, Math.floor(time / beat));
  const move = COMBO[index]!;
  const f = clamp(time / beat - index);
  // A boxer's stance, never quite still.
  pose.armSwing = [GUARD, GUARD];
  pose.armLift = [0.28, 0.28];
  pose.legSwing = [-0.25, 0.3];
  pose.tiltX = 0.18;
  pose.y = Math.abs(Math.sin(time * 17)) * 0.05;
  pose.x = Math.sin(time * 8.5) * 0.07;
  if (move === 'left' || move === 'right') {
    const side = move === 'left' ? 0 : 1;
    // Out fast, back slower.
    const reach = f < 0.35 ? ease(f / 0.35) : 1 - ease((f - 0.35) / 0.65);
    pose.armSwing[side] = mix(GUARD, -1.62, reach);
    pose.armLift[side] = mix(0.28, 0.05, reach);
    pose.tiltY = (side === 0 ? 1 : -1) * 0.6 * reach;
    pose.z = 0.26 * reach;
    // The wings flick open with every punch.
    pose.wings = 0.25 + 0.5 * reach;
  } else if (move === 'duck') {
    const dip = Math.sin(Math.PI * f);
    pose.y = -0.16 * dip;
    pose.tiltZ = (index % 2 ? 1 : -1) * 0.5 * dip;
    pose.tiltX = 0.18 + 0.3 * dip;
  } else if (move === 'wind') {
    const drawn = ease(f);
    pose.y = -0.14 * drawn;
    pose.tiltY = -0.9 * drawn;
    pose.tiltX = 0.3;
    pose.armSwing[1] = mix(GUARD, 0.7, drawn);
  } else if (move === 'upper') {
    pose.y = Math.sin(Math.PI * f) * 0.6;
    pose.x = 0;
    pose.turn = TURN * ease(f);
    pose.tiltX = -0.1;
    pose.armSwing[1] = mix(0.7, -2.9, clamp(f * 3));
    pose.legSwing = [-0.5, -0.3];
    pose.wings = 1.1;
  } else {
    // Two beats with the winning fist in the air.
    const held = clamp((time - 10 * beat) / (2 * beat));
    pose.x = 0;
    pose.y = Math.abs(Math.sin(held * TURN)) * 0.04;
    pose.tiltX = -0.12;
    pose.armSwing = [-0.2, -2.9];
    pose.armLift = [0.5, 0.15];
    pose.legSwing = [0, 0];
    pose.legSplay = 0.25;
    pose.wings = 0.9 + Math.sin(held * TURN * 3) * 0.2;
  }
  return pose;
}

/**
 * The Big Flap: a crouch with the wings folded tight, then up off the desk
 * on huge slow wingbeats, turning once round in the air with the arms
 * flapping too, and down into a landing with everything flung wide.
 */
function bigFlap(time: number): DancePose {
  const pose = still();
  const u = clamp(time / DANCE.seconds);
  if (u < 0.22) {
    const crouch = ease(u / 0.22);
    pose.y = -0.16 * crouch;
    pose.tiltX = 0.35 * crouch;
    pose.wings = 0.15 - 0.25 * crouch;
    pose.armSwing = [-0.6 * crouch, -0.6 * crouch];
    pose.armLift = [0.1, 0.1];
    pose.legSwing = [-0.5 * crouch, -0.5 * crouch];
  } else if (u < 0.82) {
    const v = (u - 0.22) / 0.6;
    // Up, a hover, and down again.
    const height = Math.min(ease(v / 0.25), ease((1 - v) / 0.25)) * 0.7;
    const beat = Math.sin(time * TURN * 4.2);
    pose.wings = 0.55 + 0.85 * beat;
    // Each downstroke lifts it a little.
    pose.y = height * (1 - beat * 0.08);
    pose.turn = TURN * ease(v);
    pose.tiltX = -0.15;
    pose.armSwing = [-0.1, -0.1];
    pose.armLift = [0.85 + 0.65 * beat, 0.85 + 0.65 * beat];
    const kick = Math.sin(time * 12) * 0.25;
    pose.legSwing = [0.3 + kick, 0.3 - kick];
  } else {
    const landed = (u - 0.82) / 0.18;
    pose.y = -0.12 * Math.sin(Math.PI * clamp(landed * 2));
    pose.tiltX = -0.1;
    pose.wings = 1.25 + Math.sin(landed * Math.PI * 8) * 0.1;
    pose.armSwing = [-0.15, -0.15];
    pose.armLift = [1.35, 1.35];
    pose.legSplay = 0.35;
  }
  return pose;
}

/**
 * The Siuuu: a short run, a leap with a half turn in the air, and a landing
 * with the legs planted wide, the chest out and both arms thrown down and
 * back, held while it shouts.
 */
function siu(time: number): DancePose {
  const pose = still();
  const u = clamp(time / DANCE.seconds);
  if (u < 0.3) {
    const stride = Math.sin(time * 20);
    pose.z = 0.3 * (u / 0.3);
    pose.y = Math.abs(stride) * 0.07;
    pose.tiltX = 0.2;
    pose.armSwing = [-0.4 + 0.8 * stride, -0.4 - 0.8 * stride];
    pose.armLift = [0.18, 0.18];
    pose.legSwing = [-0.8 * stride, 0.8 * stride];
  } else if (u < 0.58) {
    const j = (u - 0.3) / 0.28;
    const air = Math.sin(Math.PI * j);
    pose.z = 0.3;
    pose.y = air * 0.65;
    pose.turn = Math.PI * ease(j);
    const up = mix(-0.4, -2.7, ease(j * 2));
    pose.armSwing = [up, up];
    pose.armLift = [0.35, 0.35];
    pose.legSwing = [-0.6 * air, -0.6 * air];
    pose.wings = 0.3 + 0.9 * air;
  } else {
    const k = (u - 0.58) / 0.42;
    const slam = ease(k / 0.12);
    const down = mix(-2.7, 0.55, slam);
    pose.armSwing = [down, down];
    pose.armLift = [mix(0.35, 0.85, slam), mix(0.35, 0.85, slam)];
    pose.legSplay = 0.6 * slam;
    pose.tiltX = -0.3 * slam;
    pose.y = -0.1 * Math.sin(Math.PI * clamp(k / 0.25));
    // The wings snap open and shiver as it shouts.
    pose.wings = 1.25 + Math.sin(time * 40) * 0.06 * (1 - k);
    // Back round to the front, and back to its spot, as the routine ends.
    const home = ease((k - 0.82) / 0.18);
    pose.turn = Math.PI * (1 + home);
    pose.z = 0.3 * (1 - home);
    pose.legSplay *= 1 - home;
  }
  return pose;
}

/** The pose for routine `dance` (from 1), `time` seconds into it. */
export function dancePose(dance: number, time: number): DancePose {
  if (dance === 1) return shadowBoxing(time);
  if (dance === 2) return bigFlap(time);
  return siu(time);
}
