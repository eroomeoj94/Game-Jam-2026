export const ARENA = {
  anchor: { x: 0, y: 5.8, z: 0 },
  tetherLength: 3,
  haloRadius: 3.4,
  lampRadius: 0.22,
  mothRadius: 0.48,
  terrain: [
    {
      x: 0,
      y: -0.25,
      z: 0,
      width: 14,
      height: 0.5,
      depth: 7.5,
      color: 0x79523b,
    },
    {
      x: -2.5,
      y: 0.4,
      z: -0.7,
      width: 2.5,
      height: 0.8,
      depth: 2,
      color: 0x995845,
    },
    {
      x: 2.4,
      y: 0.6,
      z: -1,
      width: 2.2,
      height: 1.2,
      depth: 2.4,
      color: 0x526e6d,
    },
  ],
  spawns: [
    { name: 'Dusty', x: -3.4, y: 0.5, z: 1.4, color: 0xc89743 },
    { name: 'Mothhew', x: 3.3, y: 0.5, z: 1.25, color: 0x599e98 },
  ],
} as const;

export const PHYSICS_STEP_MS = 1000 / 60;
export const MAX_FRAME_MS = 100;

export const MOVEMENT = {
  speed: 3.2,
  groundAcceleration: 28,
  airAcceleration: 8,
  jumpSpeed: 5.8,
  flutterSeconds: 0.9,
  flutterAcceleration: 16,
  maxFlutterRiseSpeed: 4.5,
  fallHeight: -2.5,
  respawnDelay: 0.6,
} as const;
