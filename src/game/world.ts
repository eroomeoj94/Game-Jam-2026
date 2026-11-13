import { Body, Box, DistanceConstraint, Sphere, Vec3, World } from 'cannon-es';
import { ARENA, PHYSICS_STEP_MS } from '../config';

export type Position = Readonly<{ x: number; y: number; z: number }>;
export type WorldView = { lamp: Position; moths: Position[] };

/** Full 3D physics, independent of the renderer and its camera. */
export function createWorld() {
  const world = new World({ gravity: new Vec3(0, -9.82, 0) });
  world.defaultContactMaterial.friction = 0.6;
  world.defaultContactMaterial.restitution = 0.1;
  for (const { x, y, z, width, height, depth } of ARENA.terrain) {
    world.addBody(
      new Body({
        mass: 0,
        shape: new Box(new Vec3(width / 2, height / 2, depth / 2)),
        position: new Vec3(x, y, z),
      }),
    );
  }
  const moths = ARENA.spawns.map(({ x, y, z }) => {
    const body = new Body({
      mass: 1,
      shape: new Sphere(ARENA.mothRadius),
      position: new Vec3(x, y, z),
      fixedRotation: true,
      linearDamping: 0.25,
    });
    world.addBody(body);
    return body;
  });
  const anchor = new Body({
    mass: 0,
    position: new Vec3(ARENA.anchor.x, ARENA.anchor.y, ARENA.anchor.z),
  });
  const lamp = new Body({
    mass: 0.8,
    shape: new Sphere(ARENA.lampRadius),
    position: new Vec3(
      ARENA.anchor.x,
      ARENA.anchor.y - ARENA.tetherLength,
      ARENA.anchor.z,
    ),
    linearDamping: 0.12,
  });
  world.addBody(anchor);
  world.addBody(lamp);
  world.addConstraint(new DistanceConstraint(anchor, lamp, ARENA.tetherLength));
  const positionOf = (body: Body): Position => ({
    x: body.position.x,
    y: body.position.y,
    z: body.position.z,
  });

  return {
    step() {
      world.step(PHYSICS_STEP_MS / 1000);
    },
    nudgeLamp() {
      lamp.wakeUp();
      lamp.velocity.set(2.6, 0, 1.1);
    },
    snapshot(): WorldView {
      return { lamp: positionOf(lamp), moths: moths.map(positionOf) };
    },
    destroy() {
      for (const constraint of [...world.constraints])
        world.removeConstraint(constraint);
      for (const body of [...world.bodies]) world.removeBody(body);
    },
  };
}
