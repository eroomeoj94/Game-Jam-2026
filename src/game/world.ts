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
import {
  ARENA,
  BOSH,
  CAP,
  DANCE,
  FIRECRACKER,
  GUST,
  HAZARD,
  LAMPS,
  MOVEMENT,
  PHYSICS_STEP_MS,
  PLAYGROUND,
  ZAP,
} from '../config';
import type { WeaponId } from '../config';
import {
  blastImpulse,
  boshTarget,
  gustImpulse,
  horizontal,
  launchVelocity,
  pickLamp,
} from './gadgets';
import type { Aim, Direction } from './gadgets';
import type { Placement } from './spawns';

export type Position = Readonly<{ x: number; y: number; z: number }>;
export type MovementCommand = {
  x: number;
  z: number;
  jump: boolean;
  flutter: boolean;
};
export type MothView = Position & {
  id: number;
  team: number;
  heading: number;
  grounded: boolean;
  flutter: number;
  fluttering: boolean;
  moving: boolean;
  respawning: boolean;
  /** True while sliding or tumbling from a hit. */
  staggered: boolean;
  /** True during the comic flight after being zapped. */
  zapped: boolean;
  /** True for a moment after throwing a Bosh, for the lunge pose. */
  punching: boolean;
  /** The dance routine being performed, from 1; 0 when not dancing. */
  dance: number;
  /** Seconds into the current dance. */
  danceTime: number;
};
export type LampView = Position & {
  anchor: Position;
  zapper: boolean;
  /** Fraction of zapper time left, 0 when warm. */
  zapperLeft: number;
};
export type ProjectileView = Position & {
  id: number;
  kind: 'cap' | 'firecracker';
  /** Firecracker fuse left, 0 to 1. */
  fuse: number;
};
export type WorldEvent =
  | { type: 'gust'; origin: Position; direction: Direction }
  | {
      type: 'bosh';
      origin: Position;
      direction: Direction;
      /** The moth punched, if the punch connected with one. */
      moth?: number;
      /** Where the punch landed (the target, or thin air in front). */
      position: Position;
    }
  | { type: 'hit'; moth: number; position: Position }
  | { type: 'lamp'; lamp: number; zapper: boolean }
  | {
      type: 'zap';
      moth: number;
      team: number;
      lamp: number;
      position: Position;
    }
  | { type: 'dance'; moth: number; variant: number; position: Position }
  /** The wind-up mouse ran into a moth. */
  | { type: 'bonk'; moth: number; position: Position }
  /** The wind-up mouse was startled and turned round. */
  | { type: 'squeak'; position: Position }
  | { type: 'explode'; position: Position }
  | { type: 'launch'; kind: 'cap' | 'firecracker'; position: Position };
export type HazardView = Position & {
  /** Direction of travel, as a heading like a moth's. */
  heading: number;
  /** True for a moment after being startled. */
  startled: boolean;
};
export type WorldView = {
  lamps: LampView[];
  /** Moving toys on the desk that knock moths about. */
  hazards: HazardView[];
  projectiles: ProjectileView[];
  /** 0 when a weapon is ready, rising to 1 just after one is used. */
  weaponCooldown: number;
  /** Zaps suffered by each team: each one will cost a point. */
  teamZaps: number[];
  moths: MothView[];
  selectedMoth: number;
};
const IDLE: MovementCommand = { x: 0, z: 0, jump: false, flutter: false };
const DT = PHYSICS_STEP_MS / 1000;

/** Owns movement and physics; commands are consumed once per fixed tick. */
export type WorldOptions = {
  /**
   * Where moths start and return after a fall or zap. Defaults to each
   * moth's fixed slot in the arena, which keeps tests predictable.
   */
  placement?: Placement;
  /** Run the wind-up mouse round its track (on by default). */
  hazards?: boolean;
  /**
   * Match rules: no weapon cooldown, zappers last until `restoreLamp`, and
   * fallen or zapped moths stay off the desk until `returnMoth`.
   */
  match?: boolean;
};

export function createWorld({
  placement,
  match = false,
  hazards = true,
}: WorldOptions = {}) {
  const world = new World({ gravity: new Vec3(0, -9.82, 0) });
  world.defaultContactMaterial.friction = 0.6;
  world.defaultContactMaterial.restitution = 0;
  const terrainMaterial = new Material('terrain');
  const mothMaterial = new Material('moth');
  const capMaterial = new Material('cap');
  const firecrackerMaterial = new Material('firecracker');
  // Fixed-rotation characters use explicit ground braking. Contact friction
  // otherwise cancels the walking velocity before each simulation step.
  world.addContactMaterial(
    new ContactMaterial(mothMaterial, terrainMaterial, {
      friction: 0,
      restitution: 0,
    }),
  );
  world.addContactMaterial(
    new ContactMaterial(capMaterial, terrainMaterial, {
      friction: 0.1,
      restitution: CAP.bounciness,
    }),
  );
  world.addContactMaterial(
    new ContactMaterial(firecrackerMaterial, terrainMaterial, {
      friction: 0.3,
      restitution: FIRECRACKER.bounciness,
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
    const positions = LAMPS.positions.slice(0, LAMPS.count);
    let nearest = positions[0];
    for (const lamp of positions)
      if (
        nearest &&
        Math.hypot(lamp.x - x, lamp.z - z) <
          Math.hypot(nearest.x - x, nearest.z - z)
      )
        nearest = lamp;
    return nearest ? Math.atan2(nearest.x - x, nearest.z - z) : 0;
  }
  // Place moths one at a time so each spot accounts for those already placed.
  const starts: Position[] = [];
  for (const [id, spawn] of ARENA.spawns.entries())
    starts.push(placement?.(id, starts) ?? spawn);
  const moths = ARENA.spawns.map(({ team }, id) => {
    const { x, y, z } = starts[id]!;
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
      team,
      grounded: false,
      fuel: MOVEMENT.flutterSeconds as number,
      fluttering: false,
      heading: headingTowardsLamp(x, z),
      respawning: false,
      respawnTime: 0,
      stagger: 0,
      /** Seconds of zap flight left; 0 when not zapped. */
      zap: 0,
      /** Seconds left of the punch lunge pose. */
      punch: 0,
      /** Seconds before the wind-up mouse can hit this moth again. */
      bonkCooldown: 0,
      /** Dance routine in progress, from 1; 0 when not dancing. */
      dance: 0,
      danceTime: 0,
    };
  });
  type Moth = (typeof moths)[number];
  const mothByBody = new Map(moths.map((moth) => [moth.body, moth]));
  const teamZaps = [0, 0];
  let lastDance = 0;
  // The wind-up mouse: an angle round its oval track and a direction.
  const mouse = { angle: Math.PI * 0.5, direction: 1, boost: 0 };
  const track = ARENA.track;
  function mousePosition(): Position {
    return {
      x: Math.cos(mouse.angle) * track.rx,
      y: HAZARD.radius * 0.7,
      z: Math.sin(mouse.angle) * track.rz,
    };
  }
  /** Unit direction of travel along the track. */
  function mouseTravel() {
    const x = -Math.sin(mouse.angle) * track.rx * mouse.direction;
    const z = Math.cos(mouse.angle) * track.rz * mouse.direction;
    const length = Math.hypot(x, z) || 1;
    return { x: x / length, z: z / length, length };
  }
  let weaponCooldown = 0;
  let selectedMoth = 0;
  let events: WorldEvent[] = [];
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
    return { anchor, bulb, zapperTime: 0 };
  });
  type Projectile = {
    id: number;
    kind: 'cap' | 'firecracker';
    body: Body;
    age: number;
    /** A cap only knocks back the first moth it strikes. */
    spent: boolean;
  };
  const projectiles: Projectile[] = [];
  let nextProjectile = 1;
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

  /** A moth is in play when it can be pushed, zapped or score. */
  const inPlay = (moth: Moth) => !moth.respawning && moth.zap <= 0;

  function knock(
    moth: Moth,
    x: number,
    y: number,
    z: number,
    stagger = GUST.stagger,
  ) {
    moth.dance = 0;
    moth.body.wakeUp();
    moth.body.velocity.x += x;
    moth.body.velocity.y = Math.max(moth.body.velocity.y, 0) + y;
    moth.body.velocity.z += z;
    moth.grounded = false;
    moth.stagger = stagger;
    events.push({
      type: 'hit',
      moth: moth.id,
      position: positionOf(moth.body),
    });
  }

  function removeFromPlay(moth: Moth, delay: number) {
    world.removeBody(moth.body);
    moth.respawning = true;
    moth.respawnTime = delay;
    moth.grounded = false;
    moth.fluttering = false;
    moth.stagger = 0;
    moth.zap = 0;
  }

  /** Zap a moth: its team pays, and it is flung away from the zapper. */
  function zap(moth: Moth, lampIndex: number) {
    const lamp = lamps[lampIndex];
    if (!lamp || !inPlay(moth)) return;
    teamZaps[moth.team] = (teamZaps[moth.team] ?? 0) + 1;
    const away = horizontal({
      x: moth.body.position.x - lamp.bulb.position.x,
      y: 0,
      z: moth.body.position.z - lamp.bulb.position.z,
    }) ?? { x: Math.cos(moth.id * 2.4), z: Math.sin(moth.id * 2.4) };
    moth.body.wakeUp();
    moth.body.velocity.set(away.x * ZAP.launch, ZAP.lift, away.z * ZAP.launch);
    moth.grounded = false;
    moth.fluttering = false;
    moth.stagger = 0;
    moth.dance = 0;
    moth.zap = ZAP.flightTime;
    events.push({
      type: 'zap',
      moth: moth.id,
      team: moth.team,
      lamp: lampIndex,
      position: positionOf(moth.body),
    });
  }

  function zapInside(lampIndex: number) {
    const lamp = lamps[lampIndex];
    if (!lamp) return;
    for (const moth of moths) {
      if (!inPlay(moth)) continue;
      if (moth.body.position.distanceTo(lamp.bulb.position) <= LAMPS.haloRadius)
        zap(moth, lampIndex);
    }
  }

  function tryRespawn(moth: Moth) {
    const spawn = ARENA.spawns[moth.id];
    if (!spawn) return false;
    const others = moths
      .filter((other) => other !== moth && !other.respawning)
      .map((other) => positionOf(other.body));
    const chosen = placement?.(moth.id, others);
    // Clear alternate slots prevent teleporting into a moth camping on the perch.
    const candidates = [
      new Vec3(spawn.x, spawn.y, spawn.z),
      new Vec3(spawn.x - 1.1, spawn.y, spawn.z),
      new Vec3(spawn.x + 1.1, spawn.y, spawn.z),
      new Vec3(spawn.x, spawn.y, spawn.z + 1.1),
    ];
    const position = chosen
      ? new Vec3(chosen.x, chosen.y, chosen.z)
      : candidates.find((candidate) =>
          moths.every(
            (other) =>
              other === moth ||
              other.respawning ||
              other.body.position.distanceTo(candidate) >
                ARENA.mothRadius * 2 + 0.1,
          ),
        );
    if (!position) return false;
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
    return true;
  }

  function launch(
    kind: 'cap' | 'firecracker',
    origin: Position,
    aim: Aim,
    power: number,
  ) {
    const settings = kind === 'cap' ? CAP : FIRECRACKER;
    const velocity = launchVelocity(
      aim,
      power,
      settings.minSpeed,
      settings.maxSpeed,
    );
    const flat = horizontal(aim) ?? { x: 0, z: 0 };
    // Spawn just in front of the moth so the shot does not hit its owner.
    const start = new Vec3(
      origin.x + flat.x * (ARENA.mothRadius + settings.radius + 0.15),
      origin.y + 0.25,
      origin.z + flat.z * (ARENA.mothRadius + settings.radius + 0.15),
    );
    const body = new Body({
      mass: settings.mass,
      material: kind === 'cap' ? capMaterial : firecrackerMaterial,
      shape: new Sphere(settings.radius),
      position: start,
      velocity: new Vec3(velocity.x, velocity.y, velocity.z),
      linearDamping: 0.02,
    });
    const projectile: Projectile = {
      id: nextProjectile++,
      kind,
      body,
      age: 0,
      spent: false,
    };
    if (kind === 'cap')
      body.addEventListener('collide', (event: { body: Body }) => {
        const moth = mothByBody.get(event.body);
        if (!moth || projectile.spent || !inPlay(moth)) return;
        projectile.spent = true;
        const direction = horizontal({
          x: body.velocity.x,
          y: 0,
          z: body.velocity.z,
        }) ?? { x: 0, z: 0 };
        knock(moth, direction.x * CAP.knock, CAP.lift, direction.z * CAP.knock);
      });
    world.addBody(body);
    projectiles.push(projectile);
    events.push({ type: 'launch', kind, position: positionOf(body) });
  }

  function explode(projectile: Projectile) {
    const centre = positionOf(projectile.body);
    for (const moth of moths) {
      if (!inPlay(moth)) continue;
      const push = blastImpulse(
        centre,
        positionOf(moth.body),
        FIRECRACKER.blastRadius,
        FIRECRACKER.force,
        FIRECRACKER.lift,
      );
      if (push) knock(moth, push.x, push.y, push.z);
    }
    for (const { bulb } of lamps) {
      const push = blastImpulse(
        centre,
        positionOf(bulb),
        FIRECRACKER.lampRadius,
        FIRECRACKER.lampForce,
        0,
      );
      if (!push) continue;
      bulb.wakeUp();
      bulb.velocity.x += push.x;
      bulb.velocity.z += push.z;
    }
    events.push({ type: 'explode', position: centre });
    startleMouse(centre, FIRECRACKER.blastRadius);
  }

  /** A blow landing near the wind-up mouse sends it back the way it came. */
  function startleMouse(origin: Position, range: number) {
    if (!hazards) return;
    const at = mousePosition();
    if (Math.hypot(at.x - origin.x, at.z - origin.z) > range) return;
    mouse.direction *= -1;
    mouse.boost = HAZARD.startleBoost;
    events.push({ type: 'squeak', position: at });
  }

  function stepMouse() {
    if (!hazards) return;
    mouse.boost = Math.max(0, mouse.boost - DT * 0.8);
    const travel = mouseTravel();
    mouse.angle +=
      (mouse.direction * HAZARD.speed * (1 + mouse.boost) * DT) / travel.length;
    const at = mousePosition();
    for (const moth of moths) {
      moth.bonkCooldown = Math.max(0, moth.bonkCooldown - DT);
      if (!inPlay(moth) || moth.bonkCooldown > 0) continue;
      const p = moth.body.position;
      const dx = p.x - at.x;
      const dz = p.z - at.z;
      const gap = Math.hypot(dx, dz);
      if (gap > HAZARD.radius + ARENA.mothRadius || p.y > HAZARD.reach)
        continue;
      // Booted along the mouse's path and a little off to the side.
      const away = gap > 1e-3 ? { x: dx / gap, z: dz / gap } : { x: 0, z: 0 };
      const push = horizontal({
        x: travel.x + away.x * 0.6,
        y: 0,
        z: travel.z + away.z * 0.6,
      }) ?? { x: travel.x, z: travel.z };
      moth.bonkCooldown = 1;
      knock(
        moth,
        push.x * HAZARD.force,
        HAZARD.lift,
        push.z * HAZARD.force,
        HAZARD.stagger,
      );
      events.push({
        type: 'bonk',
        moth: moth.id,
        position: positionOf(moth.body),
      });
    }
  }

  function useGust(attacker: Moth, aim: Aim) {
    const direction = horizontal(aim);
    if (!direction) return false;
    attacker.heading = Math.atan2(direction.x, direction.z);
    const origin = positionOf(attacker.body);
    for (const moth of moths) {
      if (moth === attacker || !inPlay(moth)) continue;
      const push = gustImpulse(
        origin,
        direction,
        positionOf(moth.body),
        'moth',
      );
      if (push) knock(moth, push.x, push.y, push.z);
    }
    for (const { bulb } of lamps) {
      const push = gustImpulse(origin, direction, positionOf(bulb), 'lamp');
      if (!push) continue;
      bulb.wakeUp();
      bulb.velocity.x += push.x;
      bulb.velocity.z += push.z;
    }
    events.push({ type: 'gust', origin, direction });
    startleMouse(origin, GUST.range);
    return true;
  }

  function useBosh(attacker: Moth, aim: Aim) {
    const direction = horizontal(aim);
    if (!direction) return false;
    attacker.punch = 0.3;
    const origin = positionOf(attacker.body);
    const index = boshTarget(
      origin,
      direction,
      moths.map((moth) =>
        moth === attacker || !inPlay(moth) ? undefined : positionOf(moth.body),
      ),
    );
    const target = index === undefined ? undefined : moths[index];
    startleMouse(origin, BOSH.range + HAZARD.radius);
    if (target)
      knock(
        target,
        direction.x * BOSH.force,
        BOSH.lift,
        direction.z * BOSH.force,
        BOSH.stagger,
      );
    // Fluttering up beside a lamp lets a moth punch the bulb itself.
    const bulbIndex = boshTarget(
      origin,
      direction,
      lamps.map(({ bulb }) => positionOf(bulb)),
    );
    const bulb = bulbIndex === undefined ? undefined : lamps[bulbIndex]?.bulb;
    if (bulb) {
      bulb.wakeUp();
      bulb.velocity.x += direction.x * BOSH.lampForce;
      bulb.velocity.z += direction.z * BOSH.lampForce;
    }
    events.push({
      type: 'bosh',
      origin,
      direction,
      moth: target?.id,
      position: target
        ? positionOf(target.body)
        : {
            x: origin.x + direction.x * BOSH.range * 0.6,
            y: origin.y,
            z: origin.z + direction.z * BOSH.range * 0.6,
          },
    });
    return true;
  }

  /** The lamp a Zap Switch along `aim` reaches, if one is in range. */
  function lampInReach(attacker: Moth, aim: Aim) {
    const origin = positionOf(attacker.body);
    const index = pickLamp(
      origin,
      aim,
      lamps.map(({ bulb }) => positionOf(bulb)),
    );
    const bulb = index === undefined ? undefined : lamps[index]?.bulb;
    if (!bulb) return;
    const distance = Math.hypot(
      bulb.position.x - origin.x,
      bulb.position.z - origin.z,
    );
    return distance <= ZAP.range ? index : undefined;
  }

  function useZapSwitch(attacker: Moth, aim: Aim) {
    const index = lampInReach(attacker, aim);
    const lamp = index === undefined ? undefined : lamps[index];
    if (index === undefined || !lamp) return false;
    // Playground convenience: flipping a zapper turns it back into a lamp.
    const becomesZapper = lamp.zapperTime <= 0;
    if (match && !becomesZapper) return false;
    lamp.zapperTime = becomesZapper ? ZAP.duration : 0;
    events.push({ type: 'lamp', lamp: index, zapper: becomesZapper });
    if (becomesZapper) zapInside(index);
    return true;
  }

  return {
    selectMoth(id: number) {
      const moth = moths[id];
      if (!moth || moth.respawning) return false;
      selectedMoth = id;
      return true;
    },
    /** The lamp a Zap Switch fired along `aim` would flip, for the preview. */
    zapTarget(aim: Aim) {
      const attacker = moths[selectedMoth];
      if (!attacker) return;
      return lampInReach(attacker, aim);
    },
    step(command: MovementCommand = IDLE) {
      for (const moth of moths) {
        moth.fluttering = false;
        moth.punch = Math.max(0, moth.punch - DT);
        if (moth.dance) {
          moth.danceTime += DT;
          if (moth.danceTime >= DANCE.seconds) moth.dance = 0;
        }
        if (moth.respawning) {
          moth.respawnTime -= DT;
          if (!match && moth.respawnTime <= 0) tryRespawn(moth);
          continue;
        }
        if (moth.zap > 0) {
          moth.zap -= DT;
          // The comic flight is over: puff back in at a new spot.
          if (moth.zap <= 0) removeFromPlay(moth, 0.25);
          continue;
        }
        if (moth.grounded) moth.fuel = MOVEMENT.flutterSeconds;
        moth.stagger = Math.max(0, moth.stagger - DT);
        // A staggered moth slides freely; nothing it does can stop it.
        if (moth.stagger > 0) continue;
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
      weaponCooldown = Math.max(0, weaponCooldown - DT);
      world.step(DT);
      stepMouse();
      for (const projectile of [...projectiles]) {
        projectile.age += DT;
        const p = projectile.body.position;
        const lost =
          p.y < MOVEMENT.fallHeight ||
          Math.abs(p.x) > ARENA.desk.width / 2 + 4 ||
          Math.abs(p.z) > ARENA.desk.depth / 2 + 4;
        const done =
          projectile.kind === 'cap'
            ? projectile.age >= CAP.lifetime
            : projectile.age >= FIRECRACKER.fuse;
        if (!lost && !done) continue;
        if (projectile.kind === 'firecracker' && !lost) explode(projectile);
        world.removeBody(projectile.body);
        projectiles.splice(projectiles.indexOf(projectile), 1);
      }
      lamps.forEach((lamp, index) => {
        if (lamp.zapperTime <= 0) return;
        if (!match) lamp.zapperTime = Math.max(0, lamp.zapperTime - DT);
        if (lamp.zapperTime === 0) {
          events.push({ type: 'lamp', lamp: index, zapper: false });
          return;
        }
        // Anyone pushed, swung or wandering into a zapper's light is zapped.
        zapInside(index);
      });
      for (const moth of moths) {
        if (moth.respawning) continue;
        const p = moth.body.position;
        if (
          p.y < MOVEMENT.fallHeight ||
          Math.abs(p.x) > ARENA.desk.width / 2 + 2 ||
          Math.abs(p.z) > ARENA.desk.depth / 2 + 2
        ) {
          removeFromPlay(moth, MOVEMENT.respawnDelay);
        } else if (moth.zap <= 0) {
          moth.grounded = isGrounded(moth.body);
          if (moth.grounded) {
            moth.fuel = MOVEMENT.flutterSeconds;
            moth.fluttering = false;
          }
        }
      }
    },
    /**
     * The selected moth uses a weapon along a 3D `aim`, with charged `power`
     * from 0 to 1 for weapons that charge. Returns false when unavailable.
     */
    useWeapon(weapon: WeaponId, aim: Aim, power = 1) {
      const attacker = moths[selectedMoth];
      if (!attacker || !inPlay(attacker) || weaponCooldown > 0) return false;
      if (![aim.x, aim.y, aim.z].every(Number.isFinite)) return false;
      const flat = horizontal(aim);
      if (flat) attacker.heading = Math.atan2(flat.x, flat.z);
      const origin = positionOf(attacker.body);
      let used = false;
      if (weapon === 'gust') used = useGust(attacker, aim);
      else if (weapon === 'bosh') used = useBosh(attacker, aim);
      else if (weapon === 'zap') used = useZapSwitch(attacker, aim);
      else if (flat || aim.y > 0) {
        launch(weapon, origin, aim, power);
        used = true;
      }
      if (used && !match) weaponCooldown = PLAYGROUND.cooldown;
      return used;
    },
    /** Match rules: turn a zapper back into a warm lamp. */
    restoreLamp(index: number) {
      const lamp = lamps[index];
      if (!lamp || lamp.zapperTime <= 0) return false;
      lamp.zapperTime = 0;
      events.push({ type: 'lamp', lamp: index, zapper: false });
      return true;
    },
    /** Match rules: drop a moth that sat out back onto the desk. */
    returnMoth(id: number) {
      const moth = moths[id];
      if (!moth || !moth.respawning) return false;
      return tryRespawn(moth);
    },
    /**
     * The selected moth dances instead of attacking. Picks a routine at
     * random, never the same one twice running, unless `variant` is given.
     * Returns the routine number, or 0 when the moth cannot dance.
     */
    dance(variant?: number) {
      const moth = moths[selectedMoth];
      if (!moth || !inPlay(moth)) return 0;
      const routines = DANCE.names.length;
      let chosen = variant ?? 0;
      if (!Number.isInteger(chosen) || chosen < 1 || chosen > routines)
        do chosen = 1 + Math.floor(Math.random() * routines);
        while (chosen === lastDance && routines > 1);
      lastDance = chosen;
      moth.dance = chosen;
      moth.danceTime = 0;
      events.push({
        type: 'dance',
        moth: moth.id,
        variant: chosen,
        position: positionOf(moth.body),
      });
      return chosen;
    },
    /** Events since the last call, for effects and sound. */
    drainEvents() {
      const drained = events;
      events = [];
      return drained;
    },
    /** Move a moth directly, for tests and debugging only. */
    placeMoth(id: number, position: Position) {
      const moth = moths[id];
      if (!moth || moth.respawning) return;
      const target = new Vec3(position.x, position.y, position.z);
      moth.body.position.copy(target);
      moth.body.previousPosition.copy(target);
      moth.body.interpolatedPosition.copy(target);
      moth.body.velocity.setZero();
      moth.body.aabbNeedsUpdate = true;
      moth.body.wakeUp();
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
        weaponCooldown: weaponCooldown / Math.max(PLAYGROUND.cooldown, 1e-6),
        hazards: hazards
          ? [
              {
                ...mousePosition(),
                heading: Math.atan2(mouseTravel().x, mouseTravel().z),
                startled: mouse.boost > 0,
              },
            ]
          : [],
        teamZaps: [...teamZaps],
        lamps: lamps.map(({ anchor, bulb, zapperTime }) => ({
          ...positionOf(bulb),
          anchor: positionOf(anchor),
          zapper: zapperTime > 0,
          zapperLeft: match
            ? Number(zapperTime > 0)
            : zapperTime / Math.max(ZAP.duration, 1e-6),
        })),
        projectiles: projectiles.map(({ id, kind, body, age }) => ({
          ...positionOf(body),
          id,
          kind,
          fuse:
            kind === 'firecracker'
              ? Math.max(0, 1 - age / FIRECRACKER.fuse)
              : 0,
        })),
        selectedMoth,
        moths: moths.map((moth) => ({
          ...positionOf(moth.body),
          id: moth.id,
          team: moth.team,
          heading: moth.heading,
          grounded: moth.grounded,
          flutter: moth.fuel / MOVEMENT.flutterSeconds,
          fluttering: moth.fluttering,
          respawning: moth.respawning,
          staggered: moth.stagger > 0,
          zapped: moth.zap > 0,
          punching: moth.punch > 0,
          dance: moth.dance,
          danceTime: moth.danceTime,
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
