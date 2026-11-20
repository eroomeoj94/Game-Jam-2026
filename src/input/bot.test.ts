import { afterEach, beforeEach, expect, it } from 'vitest';
import { ARENA, LAMPS, MATCH, PHYSICS_STEP_MS } from '../config';
import { createMatch, crowdedSpot, lampControl } from '../game/match';
import { nearLampPlacement } from '../game/spawns';
import { createWorld } from '../game/world';
import { BOT, createBot } from './bot';
import type { BotOrder } from './bot';

const IDLE = { x: 0, z: 0, jump: false, flutter: false };

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Drive the real world and rules the way the application does. */
function table(seed: number) {
  const random = seeded(seed);
  const world = createWorld({
    placement: nearLampPlacement(random),
    match: true,
    attention: 'hold',
    random,
  });
  const match = createMatch(ARENA.spawns.map(({ team }) => team));
  const bots = [createBot(0, random), createBot(1, random)];
  const orders: BotOrder['type'][] = [];
  const apply = () => {
    for (const event of match.drainEvents()) {
      if (event.type === 'return')
        event.moths.forEach((id) => world.returnMoth(id));
      else if (event.type === 'lamp-restored') world.restoreLamp(event.lamp);
      else if (event.type === 'strike') world.strike();
      else if (event.type === 'turn') {
        if (event.moth !== undefined) world.selectMoth(event.moth);
      } else if (event.type === 'threat') {
        const view = world.snapshot();
        const spot = view.hazards.length
          ? undefined
          : crowdedSpot(view, LAMPS.haloRadius, random);
        if (spot) world.threaten(spot);
      }
    }
    for (const moth of world.snapshot().moths)
      if (moth.respawning && !match.isResting(moth.id)) match.mothOut(moth.id);
  };
  const tick = () => {
    const before = match.view();
    const order = bots[before.team]!.tick(world.snapshot(), before);
    orders.push(order.type);
    let steer = IDLE;
    if (order.type === 'start') match.startMove();
    else if (order.type === 'walk') steer = order;
    else if (order.type === 'aim') match.beginAim();
    else if (order.type === 'fire') {
      if (world.useWeapon(order.shot.weapon, order.shot.aim))
        match.fired(order.shot.weapon);
      else if (match.pass()) world.dance();
    } else if (order.type === 'dance' && match.pass()) world.dance();
    const turn = match.view();
    if (turn.stepping) world.step(turn.phase === 'move' ? steer : IDLE);
    for (const event of world.drainEvents())
      if (event.type === 'zap') match.zapped(event.team);
    const view = world.snapshot();
    for (const moth of view.moths)
      if (moth.respawning && !match.isResting(moth.id)) match.mothOut(moth.id);
    const active = match.view().active;
    match.tick(PHYSICS_STEP_MS / 1000, {
      grounded: active === undefined || (view.moths[active]?.grounded ?? true),
      busy:
        view.projectiles.length > 0 ||
        view.moths.some(
          (moth) =>
            !moth.respawning &&
            (moth.zapped ||
              moth.staggered ||
              moth.dance > 0 ||
              moth.moving ||
              !moth.grounded),
        ),
      lamps: lampControl(view, LAMPS.haloRadius),
      hand: view.hazards.length > 0,
    });
    apply();
  };
  apply();
  for (let step = 0; step < 30; step++) world.step();
  world.drainEvents();
  return { world, match, tick, orders };
}

const saved = { ...MATCH };
const pace = { ...BOT };
beforeEach(() => {
  MATCH.scoring = 'incoming';
  MATCH.bannerSeconds = 0.1;
  // No need to wait for a spectator here.
  BOT.thinkSeconds = 0;
  BOT.aimSeconds = 0;
});
afterEach(() => {
  Object.assign(MATCH, saved);
  Object.assign(BOT, pace);
});

it('stays idle when it is not its turn', () => {
  const { world, match } = table(1);
  const teal = createBot(1);
  expect(match.view().team).toBe(0);
  expect(teal.tick(world.snapshot(), match.view())).toEqual({ type: 'idle' });
  world.destroy();
});

it('walks its moth towards a lamp and then ends its go', () => {
  const { world, match, tick, orders } = table(2);
  const id = match.view().active!;
  const start = world.snapshot().moths[id]!;
  const nearest = (x: number, z: number) =>
    Math.min(
      ...world
        .snapshot()
        .lamps.map((lamp) => Math.hypot(lamp.anchor.x - x, lamp.anchor.z - z)),
    );
  const before = nearest(start.x, start.z);
  for (let step = 0; step < 1200 && match.view().acted.length === 0; step++)
    tick();
  expect(match.view().acted).toContain(id);
  const end = world.snapshot().moths[id]!;
  expect(nearest(end.x, end.z)).toBeLessThan(before);
  expect(orders).toContain('start');
  expect(orders).toContain('walk');
  expect(orders.some((type) => type === 'fire' || type === 'dance')).toBe(true);
  world.destroy();
});

it('two computers play a whole match to a winner', () => {
  const { world, match, tick } = table(3);
  let steps = 0;
  while (match.view().phase !== 'won' && steps++ < 300_000) tick();
  const end = match.view();
  expect(end.round).toBeGreaterThan(1);
  expect(end.phase).toBe('won');
  expect(Math.max(...end.scores)).toBeGreaterThanOrEqual(MATCH.targetScore);
  world.destroy();
}, 120_000);
