import {
  Body,
  Box,
  Cylinder,
  ContactMaterial,
  DistanceConstraint,
  Material,
  Sphere,
  Vec3,
  World,
} from 'cannon-es';
import { ARENA, LAMPS, MOVEMENT, PHYSICS_STEP_MS } from '../config';

export type Position = Readonly<{ x: number; y: number; z: number }>;
export type MovementCommand = {
  x: number;
  z: number;
  jump: boolean;
  flutter: boolean;
};
export type MothView = Position & {
  id: number;
  heading: number;
  grounded: boolean;
  flutter: number;
  fluttering: boolean;
  moving: boolean;
  respawning: boolean;
};
export type LampView = Position & { anchor: Position };
export type WorldView = {
  lamps: LampView[];
  moths: MothView[];
  selectedMoth: number;
};
const IDLE: MovementCommand = { x: 0, z: 0, jump: false, flutter: false };
const DT = PHYSICS_STEP_MS / 1000;

/** Owns movement and physics; commands are consumed once per fixed tick. */
export function createWorld() {
  const world = new World({ gravity: new Vec3(0, -9.82, 0) });
  world.defaultContactMaterial.friction = 0.6;
  world.defaultContactMaterial.restitution = 0;
  const terrainMaterial = new Material('terrain');
  const mothMaterial = new Material('moth');
  // Fixed-rotation characters use explicit ground braking. Contact friction
  // otherwise cancels the walking velocity before each simulation step.
  world.addContactMaterial(
    new ContactMaterial(mothMaterial, terrainMaterial, {
      friction: 0,
      restitution: 0,
    }),
  );
  const terrain = new Set<Body>();
  for (const piece of ARENA.terrain) {
    const body = new Body({
      mass: 0,
      material: terrainMaterial,
      // cannon-es cylinders are upright (Y-aligned), matching Three.js.
      shape:
        piece.shape === 'box'
          ? new Box(
              new Vec3(piece.width / 2, piece.height / 2, piece.depth / 2),
            )
          : new Cylinder(piece.radius, piece.radius, piece.height, 16),
      position: new Vec3(piece.x, piece.y, piece.z),
    });
    terrain.add(body);
    world.addBody(body);
  }
  /** Face the nearest hanging lamp, so a moth starts looking at the action. */
  function headingTowardsLamp(x: number, z: number) {
    const lamps = LAMPS.positions.slice(0, LAMPS.count);
    let nearest = lamps[0];
    for (const lamp of lamps)
      if (
        nearest &&
        Math.hypot(lamp.x - x, lamp.z - z) <
          Math.hypot(nearest.x - x, nearest.z - z)
      )
        nearest = lamp;
    return nearest ? Math.atan2(nearest.x - x, nearest.z - z) : 0;
  }
  const moths = ARENA.spawns.map(({ x, y, z }, id) => {
    const body = new Body({
      mass: 1,
      material: mothMaterial,
      shape: new Sphere(ARENA.mothRadius),
      position: new Vec3(x, y, z),
      fixedRotation: true,
      linearDamping: 0.1,
    });
    world.addBody(body);
    return {
      body,
      id,
      grounded: false,
      fuel: MOVEMENT.flutterSeconds as number,
      fluttering: false,
      heading: headingTowardsLamp(x, z),
      respawning: false,
      respawnTime: 0,
    };
  });
  let selectedMoth = 0;
  // Lamp settings are read once here; changing them rebuilds the world.
  const lamps = LAMPS.positions.slice(0, LAMPS.count).map(({ x, z }) => {
    const anchor = new Body({
      mass: 0,
      position: new Vec3(x, LAMPS.anchorHeight, z),
    });
    const bulb = new Body({
      mass: 0.8,
      shape: new Sphere(ARENA.lampRadius),
      position: new Vec3(x, LAMPS.anchorHeight - LAMPS.tetherLength, z),
      linearDamping: 0.12,
    });
    world.addBody(anchor);
    world.addBody(bulb);
    world.addConstraint(
      new DistanceConstraint(anchor, bulb, LAMPS.tetherLength),
    );
    return { anchor, bulb };
  });
  const positionOf = (body: Body): Position => ({
    x: body.position.x,
    y: body.position.y,
    z: body.position.z,
  });

  function isGrounded(body: Body) {
    if (body.velocity.y > 0.5) return false;
    return world.contacts.some(
      (contact) =>
        (contact.bi === body &&
          terrain.has(contact.bj) &&
          -contact.ni.y > 0.65) ||
        (contact.bj === body && terrain.has(contact.bi) && contact.ni.y > 0.65),
    );
  }

  function tryRespawn(moth: (typeof moths)[number]) {
    const spawn = ARENA.spawns[moth.id];
    if (!spawn) return;
    // Clear alternate slots prevent teleporting into a moth camping on the perch.
    const candidates = [
      new Vec3(spawn.x, spawn.y, spawn.z),
      new Vec3(spawn.x - 1.1, spawn.y, spawn.z),
      new Vec3(spawn.x + 1.1, spawn.y, spawn.z),
      new Vec3(spawn.x, spawn.y, spawn.z + 1.1),
    ];
    const position = candidates.find((candidate) =>
      moths.every(
        (other) =>
          other === moth ||
          other.respawning ||
          other.body.position.distanceTo(candidate) >
            ARENA.mothRadius * 2 + 0.1,
      ),
    );
    if (!position) return;
    moth.body.position.copy(position);
    moth.body.previousPosition.copy(position);
    moth.body.interpolatedPosition.copy(position);
    moth.body.velocity.setZero();
    moth.body.angularVelocity.setZero();
    moth.body.force.setZero();
    moth.body.torque.setZero();
    moth.body.aabbNeedsUpdate = true;
    moth.body.wakeUp();
    moth.fuel = MOVEMENT.flutterSeconds;
    moth.heading = headingTowardsLamp(position.x, position.z);
    moth.grounded = false;
    moth.respawning = false;
    world.addBody(moth.body);
  }

  return {
    selectMoth(id: number) {
      const moth = moths[id];
      if (!moth || moth.respawning) return false;
      selectedMoth = id;
      return true;
    },
    step(command: MovementCommand = IDLE) {
      for (const moth of moths) {
        moth.fluttering = false;
        if (moth.respawning) {
          moth.respawnTime -= DT;
          if (moth.respawnTime <= 0) tryRespawn(moth);
          continue;
        }
        if (moth.grounded) moth.fuel = MOVEMENT.flutterSeconds;
        if (moth.id !== selectedMoth) {
          if (moth.grounded) {
            const speed = Math.hypot(
              moth.body.velocity.x,
              moth.body.velocity.z,
            );
            const scale = Math.max(
              0,
              1 - (MOVEMENT.groundAcceleration * DT) / (speed || 1),
            );
            moth.body.velocity.x *= scale;
            moth.body.velocity.z *= scale;
          }
          continue;
        }
        const { body } = moth;
        const inputX = Number.isFinite(command.x) ? command.x : 0;
        const inputZ = Number.isFinite(command.z) ? command.z : 0;
        const length = Math.max(1, Math.hypot(inputX, inputZ));
        const x = inputX / length;
        const z = inputZ / length;
        if (!moth.grounded && x === 0 && z === 0) {
          // Letting go in the air slows the moth, so hops can be aimed.
          const speed = Math.hypot(body.velocity.x, body.velocity.z);
          const scale = Math.max(
            0,
            1 - (MOVEMENT.airBrake * DT) / (speed || 1),
          );
          body.velocity.x *= scale;
          body.velocity.z *= scale;
        } else {
          const acceleration = moth.grounded
            ? MOVEMENT.groundAcceleration
            : MOVEMENT.airAcceleration;
          const changeX = x * MOVEMENT.speed - body.velocity.x;
          const changeZ = z * MOVEMENT.speed - body.velocity.z;
          const changeLength = Math.hypot(changeX, changeZ);
          const amount = Math.min(1, (acceleration * DT) / (changeLength || 1));
          body.velocity.x += changeX * amount;
          body.velocity.z += changeZ * amount;
        }
        if (x !== 0 || z !== 0) moth.heading = Math.atan2(x, z);
        if (command.jump && moth.grounded) {
          body.velocity.y = MOVEMENT.jumpSpeed;
          moth.grounded = false;
        } else if (command.flutter && !moth.grounded && moth.fuel > 0) {
          const used = Math.min(DT, moth.fuel);
          body.velocity.y = Math.min(
            MOVEMENT.maxFlutterRiseSpeed,
            body.velocity.y + MOVEMENT.flutterAcceleration * used,
          );
          moth.fuel = Math.max(0, moth.fuel - used);
          moth.fluttering = true;
        }
      }
      world.step(DT);
      for (const moth of moths) {
        if (moth.respawning) continue;
        const p = moth.body.position;
        if (
          p.y < MOVEMENT.fallHeight ||
          Math.abs(p.x) > ARENA.desk.width / 2 + 2 ||
          Math.abs(p.z) > ARENA.desk.depth / 2 + 2
        ) {
          world.removeBody(moth.body);
          moth.respawning = true;
          moth.respawnTime = MOVEMENT.respawnDelay;
          moth.grounded = false;
          moth.fluttering = false;
        } else {
          moth.grounded = isGrounded(moth.body);
          if (moth.grounded) {
            moth.fuel = MOVEMENT.flutterSeconds;
            moth.fluttering = false;
          }
        }
      }
    },
    /** Push every lamp, each in a different direction. */
    nudgeLamp() {
      lamps.forEach(({ bulb }, index) => {
        const angle = 0.4 + index * 2.1;
        bulb.wakeUp();
        bulb.velocity.set(Math.cos(angle) * 2.8, 0, Math.sin(angle) * 2.8);
      });
    },
    snapshot(): WorldView {
      return {
        lamps: lamps.map(({ anchor, bulb }) => ({
          ...positionOf(bulb),
          anchor: positionOf(anchor),
        })),
        selectedMoth,
        moths: moths.map((moth) => ({
          ...positionOf(moth.body),
          id: moth.id,
          heading: moth.heading,
          grounded: moth.grounded,
          flutter: moth.fuel / MOVEMENT.flutterSeconds,
          fluttering: moth.fluttering,
          respawning: moth.respawning,
          moving:
            !moth.respawning &&
            Math.hypot(moth.body.velocity.x, moth.body.velocity.z) > 0.15,
        })),
      };
    },
    destroy() {
      for (const constraint of [...world.constraints])
        world.removeConstraint(constraint);
      for (const body of [...world.bodies]) world.removeBody(body);
    },
  };
}
