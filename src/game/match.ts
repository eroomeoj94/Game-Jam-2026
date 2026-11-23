import { MATCH } from '../config';
import type { WeaponId } from '../config';
import type { WorldView } from './world';

/** Who holds one lamp's light right now. */
export type LampControl = {
  zapper: boolean;
  /** Burnt out: nobody can hold or score it until it relights. */
  dark: boolean;
  /** Moths of each team with their centre inside the light. */
  counts: number[];
  /** The team with the outright majority, if any. A zapper has no holder. */
  holder: number | undefined;
  /** True when moths are inside but no team has a majority. */
  contested: boolean;
};

/**
 * Count the moths in each lamp's light, using the same centre-to-bulb distance
 * as zapping. Moths that are off the desk or mid-zap do not count.
 */
export function lampControl(
  view: WorldView,
  haloRadius: number,
  teams = 2,
): LampControl[] {
  return view.lamps.map((lamp) => {
    const counts = Array.from({ length: teams }, () => 0);
    for (const moth of view.moths) {
      if (moth.respawning || moth.zapped) continue;
      const distance = Math.hypot(
        moth.x - lamp.x,
        moth.y - lamp.y,
        moth.z - lamp.z,
      );
      if (distance <= haloRadius) counts[moth.team] = counts[moth.team]! + 1;
    }
    const best = Math.max(...counts);
    const leaders = counts.filter((count) => count === best).length;
    const majority = best > 0 && leaders === 1;
    return {
      zapper: lamp.zapper,
      dark: lamp.dark,
      counts,
      holder:
        majority && !lamp.zapper && !lamp.dark
          ? counts.indexOf(best)
          : undefined,
      contested: best > 0 && !majority,
    };
  });
}

/**
 * Where the giants will swat next: the middle of the crowd under the warm
 * lamp with the most moths in its light. Ties go to `random`; undefined when
 * every light is empty.
 */
export function crowdedSpot(
  view: WorldView,
  haloRadius: number,
  random: () => number = Math.random,
) {
  let most = 0;
  let spots: { lamp: number; x: number; z: number }[] = [];
  view.lamps.forEach((lamp, index) => {
    if (lamp.zapper || lamp.dark) return;
    const inside = view.moths.filter(
      (moth) =>
        !moth.respawning &&
        !moth.zapped &&
        Math.hypot(moth.x - lamp.x, moth.y - lamp.y, moth.z - lamp.z) <=
          haloRadius,
    );
    if (!inside.length || inside.length < most) return;
    if (inside.length > most) spots = [];
    most = inside.length;
    spots.push({
      lamp: index,
      x: inside.reduce((sum, moth) => sum + moth.x, 0) / inside.length,
      z: inside.reduce((sum, moth) => sum + moth.z, 0) / inside.length,
    });
  });
  return spots[Math.floor(random() * spots.length)];
}

export type Phase =
  /** World paused: pick a moth, then move or aim. */
  | 'plan'
  /** World running: the active moth spends its movement allowance. */
  | 'move'
  /** World running: movement is spent and the moth is landing. */
  | 'settle'
  /** World paused: choose a weapon, aim and fire, or pass. */
  | 'aim'
  /** World running: the action plays out. */
  | 'resolve'
  /** World running: the giant hand comes down before the round is scored. */
  | 'smack'
  /** World paused: the round's points are shown. */
  | 'scored'
  | 'won';

export type MatchEvent =
  /** Moths that sat out are due back on the desk. */
  | { type: 'return'; moths: number[] }
  | { type: 'turn'; team: number; round: number; moth: number | undefined }
  /** A new round: hang a hand over the most crowded lamp. */
  | { type: 'threat'; round: number }
  /** The round's goes are over: let the hanging hand fall. */
  | { type: 'strike' }
  /** Points were just handed out: the team awarded each lamp, if any. */
  | {
      type: 'banked';
      awards: (number | undefined)[];
      /** Points each lamp paid: more than one for the hot lamp. */
      points: number[];
    }
  /** This round's hot lamp, worth extra; undefined when there is none. */
  | { type: 'hot'; lamp: number | undefined }
  /** A lamp burnt out after paying the same team too often, or relit. */
  | { type: 'lamp-dark'; lamp: number; dark: boolean }
  /** A zapper's time is up: turn it back into a warm lamp. */
  | { type: 'lamp-restored'; lamp: number }
  | {
      type: 'scored';
      round: number;
      /** The team awarded each lamp's point, if any. */
      awards: (number | undefined)[];
      scores: number[];
    }
  | { type: 'won'; team: number };

/** What the match needs to know about the world each tick. */
export type TurnFacts = {
  /** The active moth is standing on something. */
  grounded: boolean;
  /** Projectiles are still live or a zapped moth is still flying. */
  busy: boolean;
  lamps: LampControl[];
  /** A giant hand is hanging over the desk or coming down on it. */
  hand?: boolean;
};

export type MatchView = {
  phase: Phase;
  round: number;
  /** The team whose turn it is. */
  team: number;
  /** The moth taking this turn; undefined when the team has none on the desk. */
  active: number | undefined;
  scores: number[];
  zapSwitches: number[];
  /** Fraction of the movement allowance left, 0 to 1. */
  moveLeft: number;
  /** True while physics should run. */
  stepping: boolean;
  /** Moths sitting out. */
  resting: number[];
  /** Moths that have already had their go in this team's turn. */
  acted: number[];
  /** Moths of this team still to have a go, including the active one. */
  goesLeft: number;
  /** The last round's lamp awards, shown while `phase` is 'scored' or 'won'. */
  awards: (number | undefined)[];
  /** What each of those lamps paid: more than one for a hot lamp. */
  points: number[];
  /** Points each team has banked so far this round. */
  gained: number[];
  /** The lamp worth extra this round, if any. */
  hot: number | undefined;
  /** Lamps that have burnt out and pay nothing until they relight. */
  dark: number[];
  winner: number | undefined;
};

const CAN_ACT: readonly Phase[] = ['plan', 'move', 'settle', 'aim'];
const STEPPING: readonly Phase[] = ['move', 'settle', 'resolve', 'smack'];

/**
 * The rules of a match, with no physics: phases, turn order, scoring, zapper
 * durations, resting moths and victory. In a team's turn every one of its
 * moths on the desk has one go (a move and an action), in any order, before
 * play passes to the other team. The caller runs the world while
 * `stepping` is true, reports what happens, and applies the events.
 *
 * `teams` gives the team of each moth, by moth id. `lamps` is how many lamps
 * the desk has, needed to pick each round's hot lamp.
 */
export function createMatch(
  teams: readonly number[],
  {
    lamps: lampCount = 0,
    random = Math.random,
  }: { lamps?: number; random?: () => number } = {},
) {
  const teamCount = Math.max(...teams) + 1;
  const scores = Array.from({ length: teamCount }, (_, each) =>
    each === teamCount - 1 && teamCount > 1 ? MATCH.headStart : 0,
  );
  const zapSwitches = Array.from(
    { length: teamCount },
    () => MATCH.zapSwitches,
  );
  /** Moth id → the round it may return in. */
  const out = new Map<number, number>();
  /** Lamp → turn ends left before it is restored. */
  const zappers = new Map<number, number>();
  /** Moths that have had their go in the current team's turn. */
  const acted = new Set<number>();
  /** Burnt-out lamp → turn ends left before it relights. */
  const dark = new Map<number, number>();
  /** Per lamp: the team it last paid and how many times running. */
  const streaks = new Map<number, { team: number; count: number }>();
  let hot: number | undefined;
  /**
   * The lamp that was hot when each team last played. A team banks after its
   * rival's turn, which for the second team is in the next round, so it is
   * paid for the lamp it could see pulsing when it took up its positions.
   */
  const hotFor: (number | undefined)[] = scores.map(() => undefined);
  let points: number[] = [];
  let events: MatchEvent[] = [];
  let phase: Phase = 'plan';
  let round = 1;
  /** 0 for the round's first turn, 1 for its second, and so on. */
  let turn = 0;
  let team = 0;
  let active: number | undefined;
  let moveLeft = MATCH.moveSeconds as number;
  let timer = 0;
  let awards: (number | undefined)[] = [];
  let gained = scores.map(() => 0);
  let winner: number | undefined;

  /**
   * Teams always play in the same order. Alternating who opens a round would
   * hand one team two whole turns back to back at every round change.
   */
  const teamFor = (_roundNumber: number, turnIndex: number) =>
    turnIndex % teamCount;
  /** The team's moths on the desk that have not had their go yet. */
  const waiting = () =>
    teams.flatMap((mothTeam, id) =>
      mothTeam === team && !out.has(id) && !acted.has(id) ? [id] : [],
    );

  function beginTurn() {
    team = teamFor(round, turn);
    acted.clear();
    if (turn === 0) {
      events.push({ type: 'threat', round });
      pickHot();
    }
    hotFor[team] = hot;
    const returning = teams.flatMap((mothTeam, id) =>
      mothTeam === team && (out.get(id) ?? Infinity) <= round ? [id] : [],
    );
    for (const id of returning) out.delete(id);
    if (returning.length) events.push({ type: 'return', moths: returning });
    beginGo();
  }

  /** Hand control to the team's next moth. */
  function beginGo() {
    moveLeft = MATCH.moveSeconds;
    timer = 0;
    active = waiting()[0];
    // A team with nobody on the desk passes.
    phase = active === undefined ? 'resolve' : 'plan';
    events.push({ type: 'turn', team, round, moth: active });
  }

  function resolve() {
    phase = 'resolve';
    timer = 0;
  }

  /** Choose this round's hot lamp from the lamps that can still score. */
  function pickHot() {
    const before = hot;
    const open = Array.from({ length: lampCount }, (_, lamp) => lamp).filter(
      (lamp) => !dark.has(lamp) && !zappers.has(lamp),
    );
    // Not the same lamp twice running, when there is a choice.
    const fresh = open.filter((lamp) => lamp !== before);
    const choices = fresh.length ? fresh : open;
    hot =
      MATCH.hotLamp && choices.length
        ? choices[Math.floor(random() * choices.length)]
        : undefined;
    if (hot !== before || hot !== undefined)
      events.push({ type: 'hot', lamp: hot });
  }

  /**
   * Hand out the points for each awarded lamp. `scorers` are the teams whose
   * lamps were up for payment; returns the lamps that burn out as a result.
   */
  function bank(given: (number | undefined)[], scorers: readonly number[]) {
    awards = given;
    const incoming = MATCH.scoring === 'incoming';
    points = given.map((holder, lamp) =>
      holder === undefined
        ? 0
        : lamp === (incoming ? hotFor[holder] : hot)
          ? MATCH.hotPoints
          : 1,
    );
    const burning: number[] = [];
    given.forEach((holder, lamp) => {
      const streak = streaks.get(lamp);
      if (holder === undefined) {
        // A team that was up for payment and missed out breaks its run.
        if (streak && scorers.includes(streak.team)) streaks.delete(lamp);
        return;
      }
      scores[holder] = scores[holder]! + points[lamp]!;
      gained[holder] = gained[holder]! + points[lamp]!;
      const count = streak?.team === holder ? streak.count + 1 : 1;
      streaks.set(lamp, { team: holder, count });
      if (MATCH.burnOut && count >= MATCH.burnAfter) burning.push(lamp);
    });
    if (given.some((holder) => holder !== undefined))
      events.push({ type: 'banked', awards: given, points: [...points] });
    return burning;
  }

  function endTurn({ lamps, hand }: TurnFacts) {
    if (active !== undefined) acted.add(active);
    // The rest of the team still has its goes to take.
    if (phase !== 'smack' && waiting().length) {
      beginGo();
      return;
    }
    const roundOver = turn === teamCount - 1;
    // Everyone has had a go: the hanging hand falls before anything scores.
    if (roundOver && hand && phase !== 'smack') {
      phase = 'smack';
      timer = 0;
      events.push({ type: 'strike' });
      return;
    }
    const incoming = MATCH.scoring === 'incoming';
    let burning: number[] = [];
    if (incoming) {
      // The team about to play banks the lamps it still holds: its moths
      // have just stood through the whole of its rival's turn.
      const scorer = roundOver
        ? teamFor(round + 1, 0)
        : teamFor(round, turn + 1);
      burning = bank(
        lamps.map((lamp, index) =>
          !lamp.zapper && !dark.has(index) && lamp.holder === scorer
            ? scorer
            : undefined,
        ),
        [scorer],
      );
    } else if (roundOver)
      burning = bank(
        lamps.map((lamp, index) =>
          lamp.zapper || dark.has(index) ? undefined : lamp.holder,
        ),
        scores.map((_, each) => each),
      );
    // Dark lamps count down like zappers, then today's burn-outs go dark.
    for (const [lamp, left] of [...dark]) {
      if (left > 1) dark.set(lamp, left - 1);
      else {
        dark.delete(lamp);
        events.push({ type: 'lamp-dark', lamp, dark: false });
      }
    }
    for (const lamp of burning) {
      dark.set(lamp, Math.max(1, MATCH.burnRounds * teamCount));
      streaks.delete(lamp);
      events.push({ type: 'lamp-dark', lamp, dark: true });
    }
    // Scoring comes first, so a zapper never scores in the round it ends.
    for (const [lamp, left] of [...zappers]) {
      if (left > 1) zappers.set(lamp, left - 1);
      else {
        zappers.delete(lamp);
        events.push({ type: 'lamp-restored', lamp });
      }
    }
    if (!incoming && !roundOver) {
      turn += 1;
      beginTurn();
      return;
    }
    events.push({ type: 'scored', round, awards, scores: [...scores] });
    const best = Math.max(...scores);
    const leaders = scores.filter((score) => score === best).length;
    timer = 0;
    // With incoming scoring the opening team banks at the end of each round
    // and the rest during it, so the match can only be decided once the last
    // team has banked too: then everyone has scored equally often.
    const level = incoming ? turn === teamCount - 2 : true;
    if (level && best >= MATCH.targetScore && leaders === 1) {
      winner = scores.indexOf(best);
      phase = 'won';
      events.push({ type: 'won', team: winner });
    } else phase = 'scored';
  }

  /** Carry on after the score banner: the next turn, or the next round. */
  function nextRound() {
    if (phase !== 'scored') return false;
    if (turn < teamCount - 1) turn += 1;
    else {
      round += 1;
      turn = 0;
      gained = scores.map(() => 0);
    }
    beginTurn();
    return true;
  }

  const canUse = (weapon: WeaponId) =>
    CAN_ACT.includes(phase) &&
    active !== undefined &&
    (weapon !== 'zap' || zapSwitches[team]! > 0);

  beginTurn();

  return {
    /** Choose which moth has the next go, before it moves or aims. */
    select(id: number) {
      if (
        phase !== 'plan' ||
        teams[id] !== team ||
        out.has(id) ||
        acted.has(id)
      )
        return false;
      active = id;
      return true;
    },
    /** The first movement input locks the moth in and starts the allowance. */
    startMove() {
      if (phase !== 'plan') return false;
      phase = 'move';
      return true;
    },
    /** Stop moving and freeze the world to aim. There is no going back. */
    beginAim() {
      if (phase === 'aim') return true;
      if (phase !== 'plan' && phase !== 'move' && phase !== 'settle')
        return false;
      phase = 'aim';
      return true;
    },
    /** Whether the team may fire `weapon` this turn. */
    canUse,
    /** A weapon was used. `lamp` is the lamp a Zap Switch flipped. */
    fired(weapon: WeaponId, lamp?: number) {
      if (!canUse(weapon)) return false;
      if (weapon === 'zap') {
        zapSwitches[team] = zapSwitches[team]! - 1;
        // Counted down at the end of every turn, including this one.
        if (lamp !== undefined) zappers.set(lamp, MATCH.zapperTurns + 1);
      }
      resolve();
      return true;
    },
    /** Skip the action. The world still runs for the resolution interval. */
    pass() {
      if (!CAN_ACT.includes(phase)) return false;
      resolve();
      return true;
    },
    /** One of `forTeam`'s moths was zapped. */
    zapped(forTeam: number) {
      if (phase === 'won' || scores[forTeam] === undefined) return;
      scores[forTeam] -= MATCH.zapPenalty;
    },
    /** A moth fell off the desk or finished its zap flight: it sits out. */
    mothOut(id: number) {
      if (out.has(id) || teams[id] === undefined) return;
      out.set(id, round + 1 + MATCH.restRounds);
      // Losing the active moth mid-turn forfeits its action.
      if (id === active && CAN_ACT.includes(phase)) resolve();
    },
    isResting(id: number) {
      return out.has(id);
    },
    /** Advance timers by `dt` seconds. Call once per simulation tick. */
    tick(dt: number, facts: TurnFacts) {
      if (phase === 'move') {
        // No allowance means no limit: the player ends the move by aiming.
        if (MATCH.moveSeconds <= 0) return;
        moveLeft = Math.max(0, moveLeft - dt);
        if (moveLeft === 0) {
          phase = 'settle';
          timer = 0;
        }
      } else if (phase === 'settle') {
        timer += dt;
        if (facts.grounded || timer >= MATCH.settleSeconds) phase = 'aim';
      } else if (phase === 'resolve') {
        timer += dt;
        if (
          (timer >= MATCH.resolveSeconds && !facts.busy) ||
          timer >= MATCH.maxResolveSeconds
        )
          endTurn(facts);
      } else if (phase === 'smack') {
        timer += dt;
        if (
          (timer >= MATCH.resolveSeconds && !facts.hand && !facts.busy) ||
          timer >= MATCH.maxSmackSeconds
        )
          endTurn(facts);
      } else if (phase === 'scored') {
        timer += dt;
        if (timer >= MATCH.bannerSeconds) nextRound();
      }
    },
    /** Skip the end-of-round pause. */
    nextRound,
    drainEvents() {
      const drained = events;
      events = [];
      return drained;
    },
    view(): MatchView {
      return {
        phase,
        round,
        team,
        active,
        scores: [...scores],
        zapSwitches: [...zapSwitches],
        moveLeft: MATCH.moveSeconds > 0 ? moveLeft / MATCH.moveSeconds : 1,
        stepping: STEPPING.includes(phase),
        resting: [...out.keys()],
        acted: [...acted],
        goesLeft: waiting().length,
        awards: [...awards],
        points: [...points],
        gained: [...gained],
        hot,
        dark: [...dark.keys()],
        winner,
      };
    },
  };
}
export type Match = ReturnType<typeof createMatch>;
