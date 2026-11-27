import { Body, Box, Cylinder, Quaternion, Vec3 } from 'cannon-es';
import type { Material, World } from 'cannon-es';
import { MOVEMENT } from '../config';
import type { GadgetSpec } from '../config';

type Spot = { x: number; z: number };
type Point = { x: number; y: number; z: number };
/** A loose part's position and which way up it is. */
export type PartView = Point & { q: [number, number, number, number] };

/** What the scene needs to draw each contraption this frame. */
export type GadgetView =
  | (Point & {
      type: 'blower';
      kind: 'fan' | 'kettle';
      radius: number;
      height: number;
      /** Where it is pointing now, as a heading. */
      heading: number;
      /** 0 when idle, up to 1 at full blast. */
      strength: number;
      range: number;
      halfAngle: number;
    })
  | (Point & {
      type: 'launcher';
      kind: 'toaster' | 'seesaw';
      heading: number;
      width: number;
      height: number;
      depth: number;
      /** A see-saw: which end is down, 1 or -1. */
      tilt: number;
      /** A toaster: 0 to 1 as it winds up to pop. */
      armed: number;
      /** Seconds since it last went off. */
      sincePop: number;
    })
  | (Point & {
      type: 'runner';
      kind: 'car' | 'mouse' | 'apple';
      /** How far round the loop it sets off, from 0 to 1. */
      start?: number;
      heading: number;
      length: number;
      width: number;
      height: number;
    })
  | (PartView & {
      type: 'roller';
      kind: 'pencil' | 'pin';
      length: number;
      radius: number;
      /** False once it has rolled off the edge. */
      present: boolean;
    })
  | (Point & {
      type: 'spill';
      kind: 'mug' | 'milk';
      radius: number;
      height: number;
      tipped: boolean;
      /** Which way it fell. */
      heading: number;
      /** The puddle: its middle, and how far it has spread so far. */
      puddle: Spot & { radius: number };
      color: number;
    })
  | {
      type: 'topple';
      kind: 'books' | 'plates';
      x: number;
      z: number;
      width: number;
      depth: number;
      levels: number;
      levelHeight: number;
      color: number;
      fallen: boolean;
      /** One per level once it has come down. */
      parts: PartView[];
    };

export type GadgetEvent = {
  type: 'gadget';
  kind: GadgetSpec['kind'];
  action: 'pop' | 'flip' | 'bump' | 'spill' | 'topple';
  position: Point;
};

/** The little the contraptions need to know about a moth. */
export type GadgetMoth = {
  id: number;
  body: Body;
  grounded: boolean;
  respawning: boolean;
  zap: number;
  squash: number;
};

type Dependencies = {
  world: World;
  specs: readonly GadgetSpec[];
  material: Material;
  /** Bodies a moth can stand on; contraptions add their own. */
  standable: Set<Body>;
  moths: readonly GadgetMoth[];
  /** Send a moth flying; the world's own knock. */
  knock: (moth: number, x: number, y: number, z: number) => void;
  emit: (event: GadgetEvent) => void;
  random: () => number;
};

const KINEMATIC = 4;
const facing = (heading: number) => ({
  x: Math.sin(heading),
  z: Math.cos(heading),
});
const view = (body: Body): PartView => ({
  x: body.position.x,
  y: body.position.y,
  z: body.position.z,
  q: [
    body.quaternion.x,
    body.quaternion.y,
    body.quaternion.z,
    body.quaternion.w,
  ],
});
/** Lay an upright cylinder on its side, its axis along `heading`. */
function lying(heading: number) {
  const tip = new Quaternion().setFromAxisAngle(new Vec3(1, 0, 0), Math.PI / 2);
  const turn = new Quaternion().setFromAxisAngle(new Vec3(0, 1, 0), heading);
  return turn.mult(tip);
}

/**
 * Everything on a level that moves or reacts: fans, toasters, see-saws,
 * wind-up toys, things that roll, mugs that spill and stacks that topple.
 */
export function createContraptions({
  world,
  specs,
  material,
  standable,
  moths,
  knock,
  emit,
  random,
}: Dependencies) {
  let time = 0;
  /** Moths in a blower's stream this tick: they do not brake against it. */
  const blown = new Set<number>();
  const inPlay = (moth: GadgetMoth) =>
    !moth.respawning && moth.zap <= 0 && moth.squash <= 0;
  const solid = (body: Body) => {
    standable.add(body);
    world.addBody(body);
    return body;
  };
  const drop = (body: Body) => {
    standable.delete(body);
    world.removeBody(body);
  };

  const blowers = specs.flatMap((spec) =>
    spec.type === 'blower'
      ? [
          {
            spec,
            heading: spec.heading,
            strength: 0,
            body: solid(
              new Body({
                mass: 0,
                material,
                shape: new Cylinder(spec.radius, spec.radius, spec.height, 12),
                position: new Vec3(spec.x, spec.height / 2, spec.z),
              }),
            ),
          },
        ]
      : [],
  );

  const launchers = specs.flatMap((spec) => {
    if (spec.type !== 'launcher') return [];
    const body = solid(
      new Body({
        mass: 0,
        material,
        shape: new Box(
          new Vec3(spec.width / 2, spec.height / 2, spec.depth / 2),
        ),
        position: new Vec3(spec.x, spec.height / 2, spec.z),
      }),
    );
    body.quaternion.setFromAxisAngle(new Vec3(0, 1, 0), spec.heading);
    return [{ spec, body, tilt: 1, timer: 0, sincePop: 99 }];
  });
  /** Each moth's fastest fall since it last stood on something. */
  const falls = new Map<number, { speed: number; grounded: boolean }>();

  const runners = specs.flatMap((spec) => {
    if (spec.type !== 'runner' || spec.path.length < 2) return [];
    const lengths = spec.path.map((point, index) => {
      const next = spec.path[(index + 1) % spec.path.length]!;
      return Math.hypot(next.x - point.x, next.z - point.z);
    });
    const body = new Body({
      mass: 0,
      type: KINEMATIC as Body['type'],
      material,
      shape: new Box(
        new Vec3(spec.width / 2, spec.height / 2, spec.length / 2),
      ),
      position: new Vec3(spec.path[0]!.x, spec.height / 2, spec.path[0]!.z),
    });
    solid(body);
    return [
      {
        spec,
        body,
        lengths,
        total: lengths.reduce((sum, length) => sum + length, 0),
        at: 0,
        begun: false,
        heading: 0,
        bumped: new Map<number, number>(),
      },
    ];
  });

  const rollers = specs.flatMap((spec) => {
    if (spec.type !== 'roller') return [];
    const body = new Body({
      mass: 0.7,
      shape: new Cylinder(spec.radius, spec.radius, spec.length, 12),
      position: new Vec3(spec.x, spec.radius + 0.02, spec.z),
      linearDamping: 0.3,
      angularDamping: 0.3,
    });
    body.quaternion.copy(lying(spec.heading));
    solid(body);
    return [{ spec, body, present: true }];
  });

  const spills = specs.flatMap((spec) =>
    spec.type === 'spill'
      ? [
          {
            spec,
            tipped: false,
            heading: 0,
            spread: 0,
            puddle: { x: spec.x, z: spec.z },
            body: solid(
              new Body({
                mass: 0,
                material,
                shape: new Cylinder(spec.radius, spec.radius, spec.height, 12),
                position: new Vec3(spec.x, spec.height / 2, spec.z),
              }),
            ),
          },
        ]
      : [],
  );

  const stacks = specs.flatMap((spec) =>
    spec.type === 'topple'
      ? [
          {
            spec,
            fallen: false,
            parts: [] as Body[],
            body: solid(
              new Body({
                mass: 0,
                material,
                shape: new Box(
                  new Vec3(
                    spec.width / 2,
                    (spec.levels * spec.levelHeight) / 2,
                    spec.depth / 2,
                  ),
                ),
                position: new Vec3(
                  spec.x,
                  (spec.levels * spec.levelHeight) / 2,
                  spec.z,
                ),
              }),
            ),
          },
        ]
      : [],
  );

  /** Where `point` is in a launcher's own frame: across, and along. */
  function local(spec: Spot & { heading: number }, point: Point) {
    const dx = point.x - spec.x;
    const dz = point.z - spec.z;
    const { x, z } = facing(spec.heading);
    return { across: dx * z - dz * x, along: dx * x + dz * z };
  }

  function stepBlowers(dt: number) {
    blown.clear();
    for (const blower of blowers) {
      const { spec } = blower;
      blower.heading =
        spec.heading +
        spec.sweep * Math.sin((time / spec.sweepSeconds) * Math.PI * 2);
      const phase = (time % spec.period) / spec.period;
      const on = spec.duty >= 1 || phase < spec.duty;
      // It takes a moment to get going, and to die away.
      blower.strength = Math.min(
        1,
        Math.max(0, blower.strength + (on ? dt : -dt) * 2.5),
      );
      if (blower.strength <= 0) continue;
      const aim = facing(blower.heading);
      for (const moth of moths) {
        if (!inPlay(moth)) continue;
        const p = moth.body.position;
        if (p.y < 0 || p.y > spec.height + 1.6) continue;
        const dx = p.x - spec.x;
        const dz = p.z - spec.z;
        const gap = Math.hypot(dx, dz);
        if (gap > spec.range || gap < spec.radius) continue;
        const along = (dx * aim.x + dz * aim.z) / gap;
        if (along < Math.cos(spec.halfAngle)) continue;
        const falloff = (1 - 0.6 * (gap / spec.range)) * blower.strength;
        blown.add(moth.id);
        // Wind only speeds a moth up to the wind's own speed.
        const speed =
          moth.body.velocity.x * aim.x + moth.body.velocity.z * aim.z;
        if (speed >= 10 * falloff) continue;
        moth.body.wakeUp();
        moth.body.velocity.x += aim.x * spec.force * falloff * dt;
        moth.body.velocity.z += aim.z * spec.force * falloff * dt;
      }
    }
  }

  function stepLaunchers(dt: number) {
    for (const moth of moths) {
      const fall = falls.get(moth.id) ?? { speed: 0, grounded: true };
      falls.set(moth.id, fall);
      if (!moth.grounded)
        fall.speed = Math.min(fall.speed, moth.body.velocity.y);
    }
    for (const launcher of launchers) {
      const { spec } = launcher;
      launcher.sincePop += dt;
      const top = spec.height;
      const riders = moths.flatMap((moth) => {
        if (!inPlay(moth)) return [];
        const p = moth.body.position;
        if (p.y < top || p.y > top + 1.3) return [];
        const at = local(spec, p);
        if (
          Math.abs(at.across) > spec.width / 2 + 0.35 ||
          Math.abs(at.along) > spec.depth / 2 + 0.35
        )
          return [];
        return [{ moth, along: at.along }];
      });
      if (spec.kind === 'toaster') {
        launcher.timer += dt;
        if (launcher.timer < spec.period) continue;
        launcher.timer = 0;
        launcher.sincePop = 0;
        for (const { moth } of riders)
          knock(
            moth.id,
            (random() - 0.5) * 5,
            spec.power,
            (random() - 0.5) * 5,
          );
        emit({
          type: 'gadget',
          kind: spec.kind,
          action: 'pop',
          position: { x: spec.x, y: top, z: spec.z },
        });
        continue;
      }
      // A see-saw: landing hard on the raised end throws whoever is on the
      // other one, up and out beyond their end of the plank.
      for (const { moth, along } of riders) {
        const fall = falls.get(moth.id)!;
        const landed = moth.grounded && !fall.grounded && fall.speed < -2.5;
        const end = Math.sign(along);
        if (!landed || Math.abs(along) < spec.depth * 0.15) continue;
        if (end === launcher.tilt) continue;
        launcher.tilt = end;
        launcher.sincePop = 0;
        const out = facing(spec.heading);
        for (const other of riders) {
          if (other.moth === moth || Math.sign(other.along) !== -end) continue;
          knock(
            other.moth.id,
            out.x * -end * spec.power * 0.55,
            spec.power,
            out.z * -end * spec.power * 0.55,
          );
        }
        emit({
          type: 'gadget',
          kind: spec.kind,
          action: 'flip',
          position: { x: spec.x, y: top, z: spec.z },
        });
      }
    }
    for (const moth of moths) {
      const fall = falls.get(moth.id)!;
      if (moth.grounded) fall.speed = 0;
      fall.grounded = moth.grounded;
    }
  }

  function stepRunners(dt: number) {
    for (const runner of runners) {
      const { spec, body } = runner;
      // Its first step puts it at its place on the loop without a run-up.
      const placing = !runner.begun;
      if (placing) {
        runner.begun = true;
        runner.at = (spec.start ?? 0) * runner.total;
      }
      runner.at = (runner.at + spec.speed * dt) % runner.total;
      let left = runner.at;
      let index = 0;
      while (left > runner.lengths[index]!) {
        left -= runner.lengths[index]!;
        index = (index + 1) % spec.path.length;
      }
      const from = spec.path[index]!;
      const to = spec.path[(index + 1) % spec.path.length]!;
      const part = left / Math.max(runner.lengths[index]!, 1e-6);
      const x = from.x + (to.x - from.x) * part;
      const z = from.z + (to.z - from.z) * part;
      runner.heading = Math.atan2(to.x - from.x, to.z - from.z);
      // Jumping to its place must not count as speed: a body moving that
      // fast would fling whatever it touched, and overshoot its own spot.
      if (placing) body.velocity.setZero();
      else
        body.velocity.set(
          (x - body.position.x) / dt,
          0,
          (z - body.position.z) / dt,
        );
      body.position.set(x, spec.height / 2, z);
      body.quaternion.setFromAxisAngle(new Vec3(0, 1, 0), runner.heading);
      const drive = facing(runner.heading);
      for (const moth of moths) {
        const wait = (runner.bumped.get(moth.id) ?? 0) - dt;
        runner.bumped.set(moth.id, wait);
        if (!inPlay(moth) || wait > 0) continue;
        const p = moth.body.position;
        // Anyone standing on the roof rides; anyone in the way is shoved.
        if (p.y > spec.height + 0.3) continue;
        const dx = p.x - x;
        const dz = p.z - z;
        const along = dx * drive.x + dz * drive.z;
        const across = dx * drive.z - dz * drive.x;
        if (
          Math.abs(along) > spec.length / 2 + 0.6 ||
          Math.abs(across) > spec.width / 2 + 0.6
        )
          continue;
        const side = Math.sign(across) || 1;
        knock(
          moth.id,
          drive.x * spec.push + drive.z * side * 3,
          4,
          drive.z * spec.push - drive.x * side * 3,
        );
        runner.bumped.set(moth.id, 0.8);
        emit({
          type: 'gadget',
          kind: spec.kind,
          action: 'bump',
          position: { x, y: spec.height / 2, z },
        });
      }
    }
  }

  function stepLoose(dt: number) {
    for (const roller of rollers) {
      if (!roller.present || roller.body.position.y > MOVEMENT.fallHeight)
        continue;
      roller.present = false;
      drop(roller.body);
    }
    for (const spill of spills)
      if (spill.tipped) spill.spread = Math.min(1, spill.spread + dt / 1.4);
    for (const stack of stacks)
      for (const part of [...stack.parts])
        if (part.position.y < MOVEMENT.fallHeight) {
          drop(part);
          stack.parts.splice(stack.parts.indexOf(part), 1);
        }
  }

  /** How hard something at `point` is hit, from 0, and which way. */
  function reach(
    point: Point,
    origin: Point,
    direction: Spot | undefined,
    range: number,
    halfAngle: number,
  ) {
    const dx = point.x - origin.x;
    const dz = point.z - origin.z;
    const gap = Math.hypot(dx, dz);
    if (gap > range || Math.abs(point.y - origin.y) > 4) return;
    const out =
      gap > 1e-3 ? { x: dx / gap, z: dz / gap } : (direction ?? { x: 0, z: 1 });
    if (direction && gap > 0.6) {
      const along = out.x * direction.x + out.z * direction.z;
      if (along < Math.cos(halfAngle)) return;
    }
    return { way: direction ?? out, strength: 1 - 0.5 * (gap / range) };
  }

  return {
    blown,
    /** True where a moth on the ground is standing in something spilt. */
    slick(moth: GadgetMoth) {
      const p = moth.body.position;
      if (p.y > 1) return false;
      return spills.some(
        ({ tipped, puddle, spread, spec }) =>
          tipped &&
          Math.hypot(p.x - puddle.x, p.z - puddle.z) < spec.puddle * spread,
      );
    },
    step(dt: number) {
      time += dt;
      stepBlowers(dt);
      stepLaunchers(dt);
      stepRunners(dt);
      stepLoose(dt);
    },
    /**
     * Something hit the surface at `origin`: a gust or punch along
     * `direction`, or a blast or slap all round. Loose things are shoved,
     * and anything `heavy` enough brings a stack down.
     */
    disturb(
      origin: Point,
      direction: Spot | undefined,
      range: number,
      halfAngle: number,
      push: number,
      heavy: boolean,
    ) {
      for (const roller of rollers) {
        if (!roller.present) continue;
        const hit = reach(
          roller.body.position,
          origin,
          direction,
          range,
          halfAngle,
        );
        if (!hit) continue;
        roller.body.wakeUp();
        roller.body.velocity.x += hit.way.x * push * hit.strength * 0.8;
        roller.body.velocity.z += hit.way.z * push * hit.strength * 0.8;
      }
      for (const spill of spills) {
        if (spill.tipped) continue;
        const { spec } = spill;
        const hit = reach(
          { x: spec.x, y: spec.height / 2, z: spec.z },
          origin,
          direction,
          range + spec.radius,
          halfAngle,
        );
        if (!hit) continue;
        spill.tipped = true;
        spill.heading = Math.atan2(hit.way.x, hit.way.z);
        drop(spill.body);
        // It lies where it fell, and what was in it runs on ahead.
        const body = new Body({
          mass: 0,
          material,
          shape: new Cylinder(spec.radius, spec.radius, spec.height, 12),
          position: new Vec3(
            spec.x + (hit.way.x * spec.height) / 2,
            spec.radius,
            spec.z + (hit.way.z * spec.height) / 2,
          ),
        });
        body.quaternion.copy(lying(spill.heading));
        spill.body = solid(body);
        spill.puddle = {
          x: spec.x + hit.way.x * (spec.height + spec.puddle * 0.55),
          z: spec.z + hit.way.z * (spec.height + spec.puddle * 0.55),
        };
        emit({
          type: 'gadget',
          kind: spec.kind,
          action: 'spill',
          position: { x: spec.x, y: spec.height / 2, z: spec.z },
        });
      }
      for (const stack of stacks) {
        const { spec } = stack;
        const height = spec.levels * spec.levelHeight;
        for (const part of stack.parts) {
          const hit = reach(part.position, origin, direction, range, halfAngle);
          if (!hit) continue;
          part.wakeUp();
          part.velocity.x += hit.way.x * push * hit.strength * 0.6;
          part.velocity.y += 2;
          part.velocity.z += hit.way.z * push * hit.strength * 0.6;
        }
        if (stack.fallen || !heavy) continue;
        const hit = reach(
          { x: spec.x, y: height / 2, z: spec.z },
          origin,
          direction,
          range + Math.max(spec.width, spec.depth) / 2,
          halfAngle,
        );
        if (!hit) continue;
        stack.fallen = true;
        drop(stack.body);
        // Whoever was standing on top goes with it.
        for (const moth of moths) {
          const p = moth.body.position;
          if (
            inPlay(moth) &&
            p.y > height &&
            p.y < height + 1.3 &&
            Math.abs(p.x - spec.x) < spec.width / 2 + 0.4 &&
            Math.abs(p.z - spec.z) < spec.depth / 2 + 0.4
          )
            knock(moth.id, hit.way.x * 4, 3, hit.way.z * 4);
        }
        for (let level = 0; level < spec.levels; level++) {
          const part = new Body({
            mass: 0.45,
            shape:
              spec.kind === 'plates'
                ? new Cylinder(
                    spec.width / 2,
                    spec.width / 2,
                    spec.levelHeight * 0.9,
                    12,
                  )
                : new Box(
                    new Vec3(
                      spec.width / 2,
                      (spec.levelHeight * 0.92) / 2,
                      spec.depth / 2,
                    ),
                  ),
            position: new Vec3(
              spec.x,
              (level + 0.5) * spec.levelHeight,
              spec.z,
            ),
            linearDamping: 0.2,
            angularDamping: 0.2,
          });
          // The higher the book, the further it is thrown.
          const throwSpeed = (3.5 + level * 2.4) * hit.strength;
          part.velocity.set(
            hit.way.x * throwSpeed + (random() - 0.5),
            1.5 + level * 0.9 + random() * 1.5,
            hit.way.z * throwSpeed + (random() - 0.5),
          );
          // Tumbling end over end, the way it was pushed.
          const tumble = 1.5 + level * 1.6;
          part.angularVelocity.set(
            hit.way.z * tumble + (random() - 0.5) * 2,
            (random() - 0.5) * 4,
            -hit.way.x * tumble + (random() - 0.5) * 2,
          );
          stack.parts.push(solid(part));
        }
        emit({
          type: 'gadget',
          kind: spec.kind,
          action: 'topple',
          position: { x: spec.x, y: height, z: spec.z },
        });
      }
    },
    view(): GadgetView[] {
      return [
        ...blowers.map(({ spec, heading, strength }): GadgetView => ({
          type: 'blower',
          kind: spec.kind,
          x: spec.x,
          y: 0,
          z: spec.z,
          radius: spec.radius,
          height: spec.height,
          heading,
          strength,
          range: spec.range,
          halfAngle: spec.halfAngle,
        })),
        ...launchers.map(({ spec, tilt, timer, sincePop }): GadgetView => ({
          type: 'launcher',
          kind: spec.kind,
          x: spec.x,
          y: 0,
          z: spec.z,
          heading: spec.heading,
          width: spec.width,
          height: spec.height,
          depth: spec.depth,
          tilt,
          armed:
            spec.period > 0 ? Math.max(0, 1 - (spec.period - timer) / 1.2) : 0,
          sincePop,
        })),
        ...runners.map(({ spec, body, heading }): GadgetView => ({
          type: 'runner',
          kind: spec.kind,
          x: body.position.x,
          y: 0,
          z: body.position.z,
          heading,
          length: spec.length,
          width: spec.width,
          height: spec.height,
        })),
        ...rollers.map(({ spec, body, present }): GadgetView => ({
          type: 'roller',
          kind: spec.kind,
          ...view(body),
          length: spec.length,
          radius: spec.radius,
          present,
        })),
        ...spills.map(
          ({ spec, tipped, heading, spread, puddle }): GadgetView => ({
            type: 'spill',
            kind: spec.kind,
            x: spec.x,
            y: 0,
            z: spec.z,
            radius: spec.radius,
            height: spec.height,
            tipped,
            heading,
            puddle: { ...puddle, radius: spec.puddle * spread },
            color: spec.color,
          }),
        ),
        ...stacks.map(({ spec, fallen, parts }): GadgetView => ({
          type: 'topple',
          kind: spec.kind,
          x: spec.x,
          z: spec.z,
          width: spec.width,
          depth: spec.depth,
          levels: spec.levels,
          levelHeight: spec.levelHeight,
          color: spec.color,
          fallen,
          parts: parts.map(view),
        })),
      ];
    },
  };
}
