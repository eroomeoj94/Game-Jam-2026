import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ARENA, LAMPS, MATCH } from '../config';
import { createMatch, crowdedSpot, lampControl } from './match';
import type { LampControl, Match, TurnFacts } from './match';
import { createWorld } from './world';

// Moths 0 and 2 are team 0; moths 1 and 3 are team 1.
const TEAMS = [0, 1, 0, 1];
const lamp = (holder?: number, zapper = false): LampControl => ({
  zapper,
  dark: false,
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
const defaultScoring = MATCH.scoring;
// Most of these rules predate incoming scoring and are written against the
// simpler round scoring; the incoming rules have their own block below.
beforeEach(() => {
  MATCH.scoring = 'round';
  // Burn-out and the hot lamp have their own block at the end.
  MATCH.burnOut = false;
  MATCH.hotLamp = false;
});
afterEach(() => {
  MATCH.moveSeconds = defaultMoveSeconds;
  MATCH.scoring = defaultScoring;
  MATCH.burnOut = true;
  MATCH.hotLamp = true;
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

describe('mind control', () => {
  it('can be used once a match by each team', () => {
    const match = createMatch(TEAMS);
    expect(match.view().mindControls).toEqual([1, 1]);
    expect(match.canUse('mind')).toBe(true);
    expect(match.fired('mind')).toBe(true);
    resolve(match);
    expect(match.view().mindControls).toEqual([0, 1]);
    // Mustard's next moth cannot use it again; Teal still has its own.
    expect(match.canUse('mind')).toBe(false);
    expect(match.fired('mind')).toBe(false);
    while (match.view().team !== 1 || match.view().phase !== 'plan') {
      if (match.view().phase === 'scored') match.nextRound();
      else passTurn(match);
    }
    expect(match.canUse('mind')).toBe(true);
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

describe('the round smack', () => {
  const types = (match: Match) => match.drainEvents().map(({ type }) => type);

  it('asks for a threat at the start of every round, and only then', () => {
    const match = createMatch(TEAMS);
    expect(types(match)).toContain('threat');
    passTurn(match);
    expect(types(match)).not.toContain('threat');
    passTurn(match);
    match.nextRound();
    expect(match.drainEvents()).toContainEqual({ type: 'threat', round: 2 });
  });

  it('lets a hanging hand fall after the last go, and scores once it has', () => {
    const match = createMatch(TEAMS);
    const hanging = { ...facts([lamp(0)]), hand: true };
    // The hand does not fall while goes remain.
    do {
      expect(match.pass()).toBe(true);
      match.tick(MATCH.resolveSeconds, hanging);
    } while (match.view().phase === 'plan');
    expect(match.view()).toMatchObject({
      phase: 'smack',
      stepping: true,
      scores: [0, 0],
    });
    expect(types(match)).toContain('strike');
    // Still waiting while the hand is in play or moths are tumbling.
    match.tick(MATCH.resolveSeconds, hanging);
    match.tick(1, { ...facts([lamp(0)]), busy: true });
    expect(match.view().phase).toBe('smack');
    expect(match.pass()).toBe(false);
    // The round is scored on where the moths ended up after the smack.
    match.tick(0.1, facts([lamp(1)]));
    expect(match.view()).toMatchObject({ phase: 'scored', scores: [0, 1] });
    expect(types(match)).not.toContain('strike');
  });

  it('gives up waiting on a hand that never lands', () => {
    const match = createMatch(TEAMS);
    const hanging = { ...facts(), hand: true };
    do {
      match.pass();
      match.tick(MATCH.resolveSeconds, hanging);
    } while (match.view().phase === 'plan');
    match.tick(MATCH.maxSmackSeconds, hanging);
    expect(match.view().phase).toBe('scored');
  });

  it('aims at the middle of the crowd under the busiest warm lamp', () => {
    const world = createWorld();
    const [first, second] = LAMPS.positions;
    world.placeMoth(0, { x: first!.x - 1, y: 0.5, z: first!.z });
    world.placeMoth(1, { x: first!.x + 2, y: 0.5, z: first!.z });
    world.placeMoth(2, { x: second!.x, y: 0.5, z: second!.z });
    expect(crowdedSpot(world.snapshot(), LAMPS.haloRadius)).toMatchObject({
      lamp: 0,
      x: first!.x + 0.5,
      z: first!.z,
    });
    // Nobody in any light: nothing to swat.
    for (const id of [0, 1, 2])
      world.placeMoth(id, { x: ARENA.desk.width / 2 - 5, y: 0.5, z: id * 3 });
    expect(crowdedSpot(world.snapshot(), LAMPS.haloRadius)).toBeUndefined();
    world.destroy();
  });
});

describe('incoming scoring', () => {
  beforeEach(() => {
    MATCH.scoring = 'incoming';
  });
  /** Pass a whole team turn, then step past the score banner. */
  function turn(match: Match, lamps: LampControl[]) {
    passTurn(match, lamps);
    const scored = match.view();
    if (scored.phase === 'scored') match.nextRound();
    return scored;
  }

  it('is the default rule', () => {
    expect(defaultScoring).toBe('incoming');
  });

  it('banks only the lamps the incoming team still holds after its rival played', () => {
    const match = createMatch(TEAMS);
    match.drainEvents();
    // Mustard has played: Teal, about to play, banks its one lamp.
    const first = turn(match, [lamp(0), lamp(1), lamp(0)]);
    expect(first).toMatchObject({ phase: 'scored', round: 1, scores: [0, 1] });
    expect(match.drainEvents()).toContainEqual({
      type: 'banked',
      awards: [undefined, 1, undefined],
      points: [0, 1, 0],
    });
    expect(match.view()).toMatchObject({ phase: 'plan', team: 1, round: 1 });
    // Teal has played: Mustard banks its two lamps, and the round ends.
    const second = turn(match, [lamp(0), lamp(1), lamp(0)]);
    expect(second).toMatchObject({ round: 1, scores: [2, 1], gained: [2, 1] });
    expect(match.view()).toMatchObject({
      phase: 'plan',
      team: 0,
      round: 2,
      gained: [0, 0],
    });
  });

  it('scores nothing for zappers, ties or the other team’s lamps', () => {
    const match = createMatch(TEAMS);
    const tied: LampControl = { ...lamp(), contested: true };
    turn(match, [lamp(0), lamp(1, true), tied]);
    expect(match.view().scores).toEqual([0, 0]);
    expect(match.drainEvents().map(({ type }) => type)).not.toContain('banked');
  });

  it('ends the match the moment a bank puts one team alone on the target', () => {
    const match = createMatch(TEAMS);
    MATCH.targetScore = 2;
    try {
      const lamps = [lamp(0), lamp(0), lamp(1)];
      turn(match, lamps);
      // Mustard banks two at the end of round 1: that is the match, with no
      // further turn to play.
      expect(turn(match, lamps)).toMatchObject({
        phase: 'won',
        winner: 0,
        scores: [2, 1],
      });
      expect(match.nextRound()).toBe(false);
    } finally {
      MATCH.targetScore = 10;
    }
  });

  it('lets the team that banks mid-round win there and then', () => {
    const match = createMatch(TEAMS);
    MATCH.targetScore = 1;
    try {
      // Teal banks after Mustard's first turn and is alone on the target.
      expect(turn(match, [lamp(0), lamp(1)])).toMatchObject({
        phase: 'won',
        winner: 1,
        scores: [0, 1],
      });
    } finally {
      MATCH.targetScore = 10;
    }
  });
});

describe('burn-out and the hot lamp', () => {
  beforeEach(() => {
    MATCH.scoring = 'incoming';
  });
  function turn(match: Match, lamps: LampControl[]) {
    passTurn(match, lamps);
    const scored = match.view();
    if (scored.phase === 'scored') match.nextRound();
    return scored;
  }

  it('burns a lamp out for a round once it has paid the same team twice running', () => {
    MATCH.burnOut = true;
    const match = createMatch(TEAMS);
    const lamps = [lamp(0), lamp()];
    // Rounds 1 and 2: Mustard banks lamp 1 at the end of each.
    turn(match, lamps);
    expect(turn(match, lamps).scores).toEqual([1, 0]);
    expect(match.view().dark).toEqual([]);
    turn(match, lamps);
    match.drainEvents();
    expect(turn(match, lamps).scores).toEqual([2, 0]);
    expect(match.view().dark).toEqual([0]);
    expect(match.drainEvents()).toContainEqual({
      type: 'lamp-dark',
      lamp: 0,
      dark: true,
    });
    // Round 3: still standing there pays nothing, then the lamp relights.
    turn(match, lamps);
    expect(match.view().dark).toEqual([0]);
    expect(turn(match, lamps).scores).toEqual([2, 0]);
    expect(match.view().dark).toEqual([]);
    expect(match.drainEvents()).toContainEqual({
      type: 'lamp-dark',
      lamp: 0,
      dark: false,
    });
    // Round 4: it pays again, with a fresh run.
    turn(match, lamps);
    expect(turn(match, lamps).scores).toEqual([3, 0]);
    expect(match.view().dark).toEqual([]);
  });

  it('does not burn a lamp out when the run is broken', () => {
    MATCH.burnOut = true;
    const match = createMatch(TEAMS);
    turn(match, [lamp(0)]);
    turn(match, [lamp(0)]);
    // Round 2: Mustard loses the lamp when it is up for payment.
    turn(match, [lamp(0)]);
    turn(match, [lamp()]);
    // Round 3: back in the light, the count starts again.
    turn(match, [lamp(0)]);
    expect(turn(match, [lamp(0)]).scores).toEqual([2, 0]);
    expect(match.view().dark).toEqual([]);
  });

  it('pays extra for the round’s hot lamp and never picks the same one twice running', () => {
    MATCH.hotLamp = true;
    const rolls = [0.99, 0.99, 0];
    const match = createMatch(TEAMS, {
      lamps: 3,
      random: () => rolls.shift() ?? 0,
    });
    expect(match.view().hot).toBe(2);
    expect(match.drainEvents()).toContainEqual({ type: 'hot', lamp: 2 });
    const lamps = [lamp(0), lamp(), lamp(0)];
    turn(match, lamps);
    match.drainEvents();
    expect(turn(match, lamps).scores).toEqual([1 + MATCH.hotPoints, 0]);
    expect(match.drainEvents()).toContainEqual({
      type: 'banked',
      awards: [0, undefined, 0],
      points: [1, 0, MATCH.hotPoints],
    });
    // Round 2: the top roll would be lamp 3 again, so it moves on.
    expect(match.view().hot).toBe(1);
  });

  it('has no hot lamp when the rule is off', () => {
    const match = createMatch(TEAMS, { lamps: 3 });
    expect(match.view().hot).toBeUndefined();
  });
});

describe('the hot lamp and the second team', () => {
  it('pays the second team for the lamp that was hot when it played', () => {
    MATCH.scoring = 'incoming';
    MATCH.hotLamp = true;
    // Round 1's hot lamp is lamp 1; round 2's is lamp 3.
    const rolls = [0, 0.99];
    const match = createMatch(TEAMS, {
      lamps: 3,
      random: () => rolls.shift() ?? 0,
    });
    expect(match.view().hot).toBe(0);
    const lamps = [lamp(1), lamp(), lamp(1)];
    // Round 1: Mustard plays, Teal banks before it has seen a hot lamp.
    passTurn(match, lamps);
    match.nextRound();
    // Teal plays with lamp 1 pulsing, then Mustard banks nothing.
    passTurn(match, lamps);
    match.nextRound();
    expect(match.view()).toMatchObject({ round: 2, hot: 2, scores: [0, 2] });
    // Round 2: Mustard plays; Teal banks lamp 1 at double, lamp 3 at one.
    passTurn(match, lamps);
    expect(match.view()).toMatchObject({
      phase: 'scored',
      scores: [0, 2 + MATCH.hotPoints + 1],
      points: [MATCH.hotPoints, 0, 1],
    });
  });
});
