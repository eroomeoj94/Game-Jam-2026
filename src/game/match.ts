import { MATCH } from '../config';
import type { WeaponId } from '../config';
import type { WorldView } from './world';

/** Who holds one lamp's light right now. */
export type LampControl = {
  zapper: boolean;
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
      counts,
      holder: majority && !lamp.zapper ? counts.indexOf(best) : undefined,
      contested: best > 0 && !majority,
    };
  });
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
  /** World paused: the round's points are shown. */
  | 'scored'
  | 'won';

export type MatchEvent =
  /** Moths that sat out are due back on the desk. */
  | { type: 'return'; moths: number[] }
  | { type: 'turn'; team: number; round: number; moth: number | undefined }
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
  winner: number | undefined;
};

const CAN_ACT: readonly Phase[] = ['plan', 'move', 'settle', 'aim'];
const STEPPING: readonly Phase[] = ['move', 'settle', 'resolve'];

/**
 * The rules of a match, with no physics: phases, turn order, scoring, zapper
 * durations, resting moths and victory. In a team's turn every one of its
 * moths on the desk has one go (a move and an action), in any order, before
 * play passes to the other team. The caller runs the world while
 * `stepping` is true, reports what happens, and applies the events.
 *
 * `teams` gives the team of each moth, by moth id.
 */
export function createMatch(teams: readonly number[]) {
  const teamCount = Math.max(...teams) + 1;
  const scores = Array.from({ length: teamCount }, () => 0);
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

  function endTurn(lamps: readonly LampControl[]) {
    if (active !== undefined) acted.add(active);
    // The rest of the team still has its goes to take.
    if (waiting().length) {
      beginGo();
      return;
    }
    const roundOver = turn === teamCount - 1;
    if (roundOver) {
      awards = lamps.map((lamp) => (lamp.zapper ? undefined : lamp.holder));
      for (const holder of awards)
        if (holder !== undefined) scores[holder] = scores[holder]! + 1;
    }
    // Scoring comes first, so a zapper never scores in the round it ends.
    for (const [lamp, left] of [...zappers]) {
      if (left > 1) zappers.set(lamp, left - 1);
      else {
        zappers.delete(lamp);
        events.push({ type: 'lamp-restored', lamp });
      }
    }
    if (!roundOver) {
      turn += 1;
      beginTurn();
      return;
    }
    events.push({ type: 'scored', round, awards, scores: [...scores] });
    const best = Math.max(...scores);
    const leaders = scores.filter((score) => score === best).length;
    timer = 0;
    if (best >= MATCH.targetScore && leaders === 1) {
      winner = scores.indexOf(best);
      phase = 'won';
      events.push({ type: 'won', team: winner });
    } else phase = 'scored';
  }

  function nextRound() {
    if (phase !== 'scored') return false;
    round += 1;
    turn = 0;
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
          endTurn(facts.lamps);
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
        winner,
      };
    },
  };
}
export type Match = ReturnType<typeof createMatch>;
