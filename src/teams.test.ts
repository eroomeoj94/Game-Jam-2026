// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { SETUP_KEY } from './config';

afterEach(() => {
  sessionStorage.removeItem(SETUP_KEY);
  vi.resetModules();
});

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Load the game laid out for `teams` teams, as the page does after the title
 * screen saves that line-up and reloads, and let computers play a match.
 */
async function playMatch(
  teams: number,
  seed: number,
  teamSize?: number,
  /** A level, laid out from a seed with everything on it moving. */
  level?: { id: 'desk' | 'kitchen'; seed: number },
) {
  sessionStorage.setItem(
    SETUP_KEY,
    JSON.stringify({
      teams,
      humans: 0,
      moths: teamSize,
      level: level?.id,
      seed: level?.seed,
    }),
  );
  vi.resetModules();
  const config = await import('./config');
  const { createMatch, crowdedSpot, lampControl } =
    await import('./game/match');
  const { nearLampPlacement } = await import('./game/spawns');
  const { createWorld } = await import('./game/world');
  const { BOT, createBot } = await import('./input/bot');
  const { ARENA, LAMPS, MATCH, PHYSICS_STEP_MS, TEAM_LABELS } = config;
  MATCH.bannerSeconds = 0.1;
  BOT.thinkSeconds = 0;
  BOT.aimSeconds = 0;
  const random = seeded(seed);
  const world = createWorld({
    placement: nearLampPlacement(random),
    match: true,
    attention: 'hold',
    gadgets: true,
    random,
  });
  const match = createMatch(
    ARENA.spawns.map(({ team }) => team),
    { lamps: LAMPS.count, random },
  );
  const bots = TEAM_LABELS.map((_, team) => createBot(team, random));
  const turns = new Set<number>();
  const idle = { x: 0, z: 0, jump: false, flutter: false };
  const apply = () => {
    for (const event of match.drainEvents()) {
      if (event.type === 'return')
        event.moths.forEach((id) => world.returnMoth(id));
      else if (event.type === 'lamp-restored') world.restoreLamp(event.lamp);
      else if (event.type === 'strike') world.strike();
      else if (event.type === 'hot') world.setHotLamp(event.lamp);
      else if (event.type === 'lamp-dark')
        world.setLampDark(event.lamp, event.dark);
      else if (event.type === 'turn') {
        turns.add(event.team);
        if (event.moth !== undefined) world.selectMoth(event.moth);
      } else if (event.type === 'threat') {
        const view = world.snapshot();
        const spot = view.hazards.length
          ? undefined
          : crowdedSpot(view, LAMPS.haloRadius, random);
        if (spot) world.threaten(spot);
      }
    }
  };
  apply();
  for (let step = 0; step < 30; step++) world.step();
  world.drainEvents();
  let steps = 0;
  const heard = new Set<string>();
  let falls = 0;
  while (match.view().phase !== 'won' && steps++ < 600_000) {
    const before = match.view();
    const order = bots[before.team]!.tick(world.snapshot(), before);
    let steer = idle;
    if (order.type === 'start') match.startMove();
    else if (order.type === 'walk') steer = order;
    else if (order.type === 'aim') match.beginAim();
    else if (order.type === 'fire') {
      const { weapon, aim } = order.shot;
      const lamp = weapon === 'zap' ? world.zapTarget(aim) : undefined;
      if (match.canUse(weapon) && world.useWeapon(weapon, aim))
        match.fired(weapon, lamp);
      else if (match.pass()) world.dance();
    } else if (order.type === 'dance' && match.pass()) world.dance();
    const turn = match.view();
    if (turn.stepping) world.step(turn.phase === 'move' ? steer : idle);
    for (const event of world.drainEvents()) {
      if (event.type === 'zap') match.zapped(event.team);
      if (event.type === 'gadget') heard.add(`${event.kind}:${event.action}`);
    }
    const view = world.snapshot();
    for (const moth of view.moths)
      if (moth.respawning && !match.isResting(moth.id)) {
        match.mothOut(moth.id);
        falls++;
      }
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
  }
  const end = match.view();
  const moths = world.snapshot().moths.length;
  world.destroy();
  return {
    end,
    moths,
    turns,
    target: MATCH.targetScore,
    config,
    heard,
    falls,
    steps,
  };
}

// Teams, the moths each should have, and the number asked for, if any.
for (const [teams, size, asked] of [
  [3, 3, undefined],
  [4, 2, undefined],
  [4, 5, 5],
  [2, 1, 1],
] as const)
  it(`plays a whole ${teams}-team match of ${size} moths a team to a winner`, async () => {
    const { end, moths, turns, target, config } = await playMatch(
      teams,
      7,
      asked,
    );
    expect(config.TEAM_SIZE).toBe(size);
    expect(config.TEAM_COUNT).toBe(teams);
    expect(config.TEAM_LABELS.map(({ name }) => name)).toEqual(
      ['Mustard', 'Teal', 'Purple', 'Ivory'].slice(0, teams),
    );
    expect(moths).toBe(teams * size);
    // Every team had its turns, and every team has a score and its limits.
    expect([...turns].sort()).toEqual(
      Array.from({ length: teams }, (_, team) => team),
    );
    expect(end.scores).toHaveLength(teams);
    expect(end.zapSwitches).toHaveLength(teams);
    expect(end.mindControls).toHaveLength(teams);
    // One team, alone in front, reached the target.
    expect(end.phase).toBe('won');
    const best = Math.max(...end.scores);
    expect(best).toBeGreaterThanOrEqual(target);
    expect(end.scores.filter((score) => score === best)).toHaveLength(1);
    expect(end.winner).toBe(end.scores.indexOf(best));
    expect(end.round).toBeGreaterThan(1);
  }, 180_000);

// Both levels, shuffled and with everything on them moving.
for (const [id, layout] of [
  ['desk', 3],
  ['desk', 12],
  ['kitchen', 3],
  ['kitchen', 12],
] as const)
  it(`plays a whole match on the ${id}, layout ${layout}, with its contraptions running`, async () => {
    const { end, config, heard, falls, steps } = await playMatch(2, 5, 3, {
      id,
      seed: layout,
    });
    expect(config.LEVEL).toBe(id);
    expect(config.ARENA.gadgets.length).toBeGreaterThanOrEqual(6);
    expect(config.ARENA.pits).toHaveLength(id === 'kitchen' ? 1 : 0);
    expect(end.phase).toBe('won');
    expect(Math.max(...end.scores)).toBeGreaterThanOrEqual(10);
    // The level joined in, and the computers did not spend the match
    // walking into the sink.
    expect(heard.size).toBeGreaterThan(0);
    expect(falls).toBeLessThan(steps / 600);
  }, 240_000);
