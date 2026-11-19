import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ARENA, LAMPS, MATCH } from '../config';
import { createMatch, lampControl } from './match';
import type { LampControl, Match, TurnFacts } from './match';
import { createWorld } from './world';

// Moths 0 and 2 are team 0; moths 1 and 3 are team 1.
const TEAMS = [0, 1, 0, 1];
const lamp = (holder?: number, zapper = false): LampControl => ({
  zapper,
  counts: [0, 0],
  holder,
  contested: false,
});
const facts = (lamps: LampControl[] = []): TurnFacts => ({
  grounded: true,
  busy: false,
  lamps,
});
/** Run the resolution interval to the end of the turn. */
function resolve(match: Match, lamps: LampControl[] = []) {
  match.tick(MATCH.resolveSeconds, facts(lamps));
}
/** Pass the current moth's go and let it resolve. */
function passGo(match: Match, lamps: LampControl[] = []) {
  expect(match.pass()).toBe(true);
  resolve(match, lamps);
}
/** Pass every go left in the current team's turn. */
function passTurn(match: Match, lamps: LampControl[] = []) {
  const { team, round } = match.view();
  do passGo(match, lamps);
  while (
    match.view().phase === 'plan' &&
    match.view().team === team &&
    match.view().round === round
  );
}
/** Play a whole round of passes and move past the score banner. */
function passRound(match: Match, lamps: LampControl[] = []) {
  passTurn(match, lamps);
  passTurn(match, lamps);
  if (match.view().phase === 'scored') match.nextRound();
}

const defaultMoveSeconds = MATCH.moveSeconds;
afterEach(() => {
  MATCH.moveSeconds = defaultMoveSeconds;
});

describe('unlimited movement', () => {
  beforeEach(() => {
    MATCH.moveSeconds = 0;
  });

  it('keeps the move open until the player aims or passes', () => {
    const match = createMatch(TEAMS);
    match.startMove();
    match.tick(600, facts());
    expect(match.view()).toMatchObject({ phase: 'move', moveLeft: 1 });
    expect(match.beginAim()).toBe(true);
    expect(match.view()).toMatchObject({ phase: 'aim', stepping: false });
    expect(match.fired('gust')).toBe(true);
  });

  it('lets a moving moth pass', () => {
    const match = createMatch(TEAMS);
    match.startMove();
    match.tick(600, facts());
    expect(match.pass()).toBe(true);
    expect(match.view().phase).toBe('resolve');
  });
});

describe('turn order', () => {
  // These cover the optional timed move.
  beforeEach(() => {
    MATCH.moveSeconds = 6;
  });

  it('gives each team one turn per round, always in the same order', () => {
    const match = createMatch(TEAMS);
    const order: [number, number][] = [];
    for (let turn = 0; turn < 6; turn++) {
      const view = match.view();
      order.push([view.round, view.team]);
      passTurn(match);
      if (match.view().phase === 'scored') match.nextRound();
    }
    expect(order).toEqual([
      [1, 0],
      [1, 1],
      [2, 0],
      [2, 1],
      [3, 0],
      [3, 1],
    ]);
  });

  it('walks plan → move → settle → aim → resolve and hands over', () => {
    const match = createMatch(TEAMS);
    expect(match.view()).toMatchObject({ phase: 'plan', stepping: false });
    expect(match.startMove()).toBe(true);
    expect(match.view()).toMatchObject({ phase: 'move', stepping: true });
    match.tick(MATCH.moveSeconds / 2, facts());
    expect(match.view().moveLeft).toBeCloseTo(0.5);
    match.tick(MATCH.moveSeconds, facts());
    expect(match.view().phase).toBe('settle');
    // Still in the air: wait, but only up to the cap.
    match.tick(0.1, { ...facts(), grounded: false });
    expect(match.view().phase).toBe('settle');
    match.tick(0.1, facts());
    expect(match.view()).toMatchObject({ phase: 'aim', stepping: false });
    expect(match.fired('gust')).toBe(true);
    expect(match.view()).toMatchObject({ phase: 'resolve', stepping: true });
    resolve(match);
    // The team's other moth has its go before play passes across.
    expect(match.view()).toMatchObject({ phase: 'plan', team: 0, active: 2 });
    passGo(match);
    expect(match.view()).toMatchObject({ phase: 'plan', team: 1, round: 1 });
  });

  it('gives every moth in the team one go, in any order, before handing over', () => {
    const match = createMatch([0, 1, 0, 1, 0, 1]);
    expect(match.view()).toMatchObject({ team: 0, active: 0, goesLeft: 3 });
    expect(match.select(4)).toBe(true);
    passGo(match);
    expect(match.view()).toMatchObject({
      team: 0,
      active: 0,
      acted: [4],
      goesLeft: 2,
    });
    // A moth that has had its go cannot go again this turn.
    expect(match.select(4)).toBe(false);
    passGo(match);
    expect(match.view()).toMatchObject({ team: 0, active: 2, goesLeft: 1 });
    passGo(match);
    expect(match.view()).toMatchObject({
      team: 1,
      active: 1,
      acted: [],
      goesLeft: 3,
    });
  });

  it('skips the go of a moth knocked off the desk before it acted', () => {
    const match = createMatch([0, 1, 0, 1, 0, 1]);
    match.mothOut(2);
    passGo(match);
    expect(match.view()).toMatchObject({ team: 0, active: 4, goesLeft: 1 });
    passGo(match);
    expect(match.view().team).toBe(1);
  });

  it('stops waiting for a moth that never lands', () => {
    const match = createMatch(TEAMS);
    match.startMove();
    match.tick(MATCH.moveSeconds, facts());
    match.tick(MATCH.settleSeconds, { ...facts(), grounded: false });
    expect(match.view().phase).toBe('aim');
  });

  it('waits for live projectiles, up to a hard cap', () => {
    const match = createMatch(TEAMS);
    match.pass();
    match.tick(MATCH.resolveSeconds, { ...facts(), busy: true });
    expect(match.view().phase).toBe('resolve');
    match.tick(MATCH.maxResolveSeconds, { ...facts(), busy: true });
    expect(match.view()).toMatchObject({ phase: 'plan', active: 2 });
  });
});

describe('legal actions', () => {
  it('lets a team pick only its own moths, and only before moving', () => {
    const match = createMatch(TEAMS);
    expect(match.view().active).toBe(0);
    expect(match.select(1)).toBe(false);
    expect(match.select(2)).toBe(true);
    expect(match.view().active).toBe(2);
    match.startMove();
    expect(match.select(0)).toBe(false);
  });

  it('allows one action per go and no moving after aiming', () => {
    const match = createMatch(TEAMS);
    expect(match.beginAim()).toBe(true);
    expect(match.startMove()).toBe(false);
    expect(match.fired('cap')).toBe(true);
    expect(match.fired('cap')).toBe(false);
    expect(match.pass()).toBe(false);
    expect(match.beginAim()).toBe(false);
  });
});

describe('scoring', () => {
  it('scores each warm lamp for its holder at the end of the round only', () => {
    const match = createMatch(TEAMS);
    const lamps = [lamp(0), lamp(0), lamp(1), lamp(undefined)];
    passTurn(match, lamps);
    expect(match.view().scores).toEqual([0, 0]);
    passTurn(match, lamps);
    expect(match.view()).toMatchObject({
      phase: 'scored',
      scores: [2, 1],
      awards: [0, 0, 1, undefined],
    });
    expect(match.drainEvents()).toContainEqual({
      type: 'scored',
      round: 1,
      awards: [0, 0, 1, undefined],
      scores: [2, 1],
    });
  });

  it('moves on to the next round after the banner', () => {
    const match = createMatch(TEAMS);
    passTurn(match);
    passTurn(match);
    expect(match.view().stepping).toBe(false);
    match.tick(MATCH.bannerSeconds, facts());
    expect(match.view()).toMatchObject({ phase: 'plan', round: 2, team: 0 });
  });

  it('takes a point for each zapped moth, even below zero', () => {
    const match = createMatch(TEAMS);
    match.zapped(1);
    match.zapped(1);
    expect(match.view().scores).toEqual([0, -2 * MATCH.zapPenalty]);
  });

  it('ends the match when a team reaches the target with the lead', () => {
    const match = createMatch(TEAMS);
    const lamps = Array.from({ length: MATCH.targetScore }, () => lamp(1));
    passTurn(match, lamps);
    passTurn(match, lamps);
    expect(match.view()).toMatchObject({ phase: 'won', winner: 1 });
    expect(match.drainEvents()).toContainEqual({ type: 'won', team: 1 });
    expect(match.nextRound()).toBe(false);
    expect(match.pass()).toBe(false);
  });

  it('plays on while the teams are level at the target', () => {
    const match = createMatch(TEAMS);
    const lamps = Array.from({ length: MATCH.targetScore * 2 }, (_, index) =>
      lamp(index % 2),
    );
    passTurn(match, lamps);
    passTurn(match, lamps);
    expect(match.view()).toMatchObject({ phase: 'scored', winner: undefined });
  });
});

describe('zappers', () => {
  it('limits Zap Switches per team', () => {
    const match = createMatch(TEAMS);
    for (let use = 0; use < MATCH.zapSwitches; use++) {
      expect(match.view().team).toBe(0);
      expect(match.fired('zap', use)).toBe(true);
      resolve(match);
      // Skip the other team's turns and any score banner.
      while (match.view().team !== 0 || match.view().phase !== 'plan') {
        if (match.view().phase === 'scored') match.nextRound();
        else passTurn(match);
      }
    }
    expect(match.view().zapSwitches[0]).toBe(0);
    expect(match.canUse('zap')).toBe(false);
    expect(match.fired('zap', 0)).toBe(false);
    expect(match.canUse('gust')).toBe(true);
  });

  it('keeps a zapper live through the next two turns, never scoring', () => {
    const match = createMatch(TEAMS);
    const zapped = [lamp(undefined, true)];
    const restored = () =>
      match
        .drainEvents()
        .some((event) => event.type === 'lamp-restored' && event.lamp === 0);
    expect(match.fired('zap', 0)).toBe(true);
    resolve(match, zapped);
    // Finish the rest of the team's turn.
    passTurn(match, zapped);
    expect(restored()).toBe(false);
    for (let turn = 1; turn < MATCH.zapperTurns; turn++) {
      passTurn(match, zapped);
      if (match.view().phase === 'scored') match.nextRound();
      expect(restored()).toBe(false);
    }
    passTurn(match, zapped);
    expect(restored()).toBe(true);
    expect(match.view().scores).toEqual([0, 0]);
  });
});

describe('resting moths', () => {
  it('sits a moth out for the next round, then returns it on its turn', () => {
    const match = createMatch(TEAMS);
    match.drainEvents();
    match.mothOut(3);
    expect(match.isResting(3)).toBe(true);
    passRound(match);
    passRound(match);
    // Team 0 opens round 3; moth 3 returns when team 1's turn begins.
    expect(match.view()).toMatchObject({ round: 3, team: 0 });
    expect(match.isResting(3)).toBe(true);
    expect(match.drainEvents().some((event) => event.type === 'return')).toBe(
      false,
    );
    passTurn(match);
    expect(match.isResting(3)).toBe(false);
    expect(match.drainEvents()).toContainEqual({ type: 'return', moths: [3] });
  });

  it('cannot pick a resting moth, and forfeits the action if the active one is lost', () => {
    const match = createMatch(TEAMS);
    match.mothOut(2);
    expect(match.select(2)).toBe(false);
    match.startMove();
    match.mothOut(0);
    expect(match.view().phase).toBe('resolve');
    expect(match.fired('gust')).toBe(false);
  });

  it('passes the turn of a team with nobody on the desk', () => {
    const match = createMatch(TEAMS);
    match.mothOut(1);
    match.mothOut(3);
    passTurn(match);
    expect(match.view()).toMatchObject({
      team: 1,
      phase: 'resolve',
      active: undefined,
    });
    expect(match.pass()).toBe(false);
    resolve(match);
    expect(match.view().phase).toBe('scored');
  });
});

describe('lamp control from the world', () => {
  const worlds: ReturnType<typeof createWorld>[] = [];
  afterEach(() => worlds.splice(0).forEach((world) => world.destroy()));
  function setup() {
    const world = createWorld({ match: true });
    worlds.push(world);
    return world;
  }
  const under = (index: number, dx = 0) => ({
    x: LAMPS.positions[index]!.x + dx,
    y: 3,
    z: LAMPS.positions[index]!.z,
  });

  it('awards the majority, and nothing for ties, empty lights or zappers', () => {
    const world = setup();
    // Lamp 0: two of team 0 against one of team 1. Lamp 1: one each.
    world.placeMoth(0, under(0, -1.2));
    world.placeMoth(2, under(0, 1.2));
    world.placeMoth(1, under(0, 0));
    world.placeMoth(4, under(1, -1.2));
    world.placeMoth(3, under(1, 1.2));
    const control = lampControl(world.snapshot(), LAMPS.haloRadius);
    expect(control[0]).toMatchObject({
      counts: [2, 1],
      holder: 0,
      contested: false,
    });
    expect(control[1]).toMatchObject({
      counts: [1, 1],
      holder: undefined,
      contested: true,
    });
    expect(control[2]).toMatchObject({
      counts: [0, 0],
      holder: undefined,
      contested: false,
    });
  });

  it('holds zappers and fallen moths until the match releases them', () => {
    const world = setup();
    const lampSpot = LAMPS.positions[0]!;
    world.placeMoth(0, { x: lampSpot.x - 9, y: 0.5, z: lampSpot.z });
    world.placeMoth(1, under(0));
    world.selectMoth(0);
    expect(world.useWeapon('zap', { x: 1, y: 0.4, z: 0 })).toBe(true);
    // No cooldown and no flipping it back in a match.
    expect(world.snapshot().weaponCooldown).toBe(0);
    expect(world.useWeapon('zap', { x: 1, y: 0.4, z: 0 })).toBe(false);
    for (let tick = 0; tick < 60 * 20; tick++) world.step();
    const view = world.snapshot();
    expect(view.lamps[0]!.zapper).toBe(true);
    expect(lampControl(view, LAMPS.haloRadius)[0]!.holder).toBeUndefined();
    expect(view.teamZaps).toEqual([0, 1]);
    expect(view.moths[1]!.respawning).toBe(true);
    expect(world.restoreLamp(0)).toBe(true);
    expect(world.returnMoth(1)).toBe(true);
    const after = world.snapshot();
    expect(after.lamps[0]!.zapper).toBe(false);
    expect(after.moths[1]!.respawning).toBe(false);
    expect(ARENA.spawns[1]!.team).toBe(1);
  });
});
