import { BOSH, GUST, HAZARD, LAMPS, PHYSICS_STEP_MS, ZAP } from '../config';
import type { WeaponId } from '../config';
import type { Aim } from '../game/gadgets';
import { lampControl } from '../game/match';
import type { MatchView } from '../game/match';
import type { WorldView } from '../game/world';

/** How long the computer waits so a watching player can follow its turn. */
export const BOT = {
  thinkSeconds: 0.7,
  aimSeconds: 0.6,
  /** Give up walking after this long and act from wherever it got to. */
  walkSeconds: 7,
  /** Chance of a Bosh, rather than a gust, on a rival within arm's reach. */
  boshChance: 0.5,
  /** Rivals alone in a lamp's light before a Zap Switch is worth spending. */
  zapRivals: 2,
};

export type BotShot = { weapon: WeaponId; aim: Aim };
export type BotOrder =
  | { type: 'idle' }
  /** Lock in the active moth and start its move. */
  | { type: 'start' }
  | { type: 'walk'; x: number; z: number; jump: boolean; flutter: boolean }
  /** Stop and take aim; `shot` is shown as a preview until it fires. */
  | { type: 'aim'; shot?: BotShot }
  | { type: 'fire'; shot: BotShot }
  | { type: 'dance' };

const IDLE: BotOrder = { type: 'idle' };
const DT = PHYSICS_STEP_MS / 1000;

/**
 * A simple computer opponent. Each go it walks its moth to the nearest warm
 * lamp it is not already winning, keeping clear of a lamp with a giant hand
 * over it, then gusts or Boshes the nearest rival in reach, or dances. When
 * rivals crowd a lamp it has no moth under, it stands back and flips the lamp
 * into a bug zapper instead.
 * It plays through the same match commands as a person and prefers finishing
 * its go reliably to clever shots. Call `tick` once per physics step on its
 * turn and carry out the order it returns.
 */
export function createBot(team: number, random: () => number = Math.random) {
  let thinking = 0;
  let walking = 0;
  let settling = 0;
  let aiming = 0;
  let stuck = 0;
  let lastGap = Infinity;
  let target: { x: number; z: number } | undefined;
  let shot: BotShot | undefined;
  let shotChosen = false;

  function reset() {
    thinking = walking = settling = aiming = stuck = 0;
    lastGap = Infinity;
    target = undefined;
    shot = undefined;
    shotChosen = false;
  }

  /** The nearest warm lamp holding only rivals, enough of them to zap. */
  function zapChance(view: WorldView, id: number, state: MatchView) {
    const me = view.moths[id];
    if (!me || (state.zapSwitches[team] ?? 0) <= 0) return undefined;
    const control = lampControl(view, LAMPS.haloRadius);
    let best: { lamp: number; gap: number } | undefined;
    view.lamps.forEach((lamp, index) => {
      const counts = control[index]?.counts ?? [];
      const rivals = counts.reduce(
        (sum, count, other) => (other === team ? sum : sum + count),
        0,
      );
      if (lamp.zapper || (counts[team] ?? 0) > 0 || rivals < BOT.zapRivals)
        return;
      const gap = Math.hypot(lamp.x - me.x, lamp.z - me.z);
      if (!best || gap < best.gap) best = { lamp: index, gap };
    });
    return best;
  }

  function chooseTarget(view: WorldView, id: number, state: MatchView) {
    const me = view.moths[id];
    if (!me) return undefined;
    const zap = zapChance(view, id, state);
    const bulb = zap && view.lamps[zap.lamp];
    if (zap && bulb && zap.gap > 1e-3) {
      // Stand in switch range but out of the light it is about to electrify.
      const stand = Math.min(
        Math.max(zap.gap, ZAP.range * 0.75),
        ZAP.range * 0.9,
      );
      return {
        x: bulb.x + ((me.x - bulb.x) / zap.gap) * stand,
        z: bulb.z + ((me.z - bulb.z) / zap.gap) * stand,
      };
    }
    const control = lampControl(view, LAMPS.haloRadius);
    const hand = view.hazards[0];
    let best = -1;
    let bestCost = Infinity;
    view.lamps.forEach((lamp, index) => {
      if (lamp.zapper) return;
      const counts = control[index]?.counts ?? [];
      const mine = counts[team] ?? 0;
      const theirs = counts.reduce(
        (most, count, other) => (other === team ? most : Math.max(most, count)),
        0,
      );
      const inside =
        Math.hypot(me.x - lamp.x, me.y - lamp.y, me.z - lamp.z) <=
        LAMPS.haloRadius;
      // How the lamp stands without this moth: one more body helps most
      // where the teams are level, then where the bot is behind.
      const lead = mine - (inside ? 1 : 0) - theirs;
      let cost =
        Math.hypot(lamp.anchor.x - me.x, lamp.anchor.z - me.z) +
        (lead > 0 ? 25 : lead === 0 ? 0 : 6);
      if (
        hand &&
        Math.hypot(lamp.anchor.x - hand.x, lamp.anchor.z - hand.z) <
          HAZARD.radius + 5
      )
        cost += 200;
      if (cost < bestCost) {
        bestCost = cost;
        best = index;
      }
    });
    const lamp = view.lamps[best];
    if (!lamp) return undefined;
    // Stand a little off centre so the team spreads out in the light.
    const angle = (id % 4) * (Math.PI / 2);
    return {
      x: lamp.anchor.x + Math.cos(angle) * 1.6,
      z: lamp.anchor.z + Math.sin(angle) * 1.6,
    };
  }

  function chooseShot(
    view: WorldView,
    id: number,
    state: MatchView,
  ): BotShot | undefined {
    const me = view.moths[id];
    if (!me) return undefined;
    const zap = zapChance(view, id, state);
    const bulb = zap && view.lamps[zap.lamp];
    const inLight =
      !!bulb &&
      Math.hypot(me.x - bulb.x, me.y - bulb.y, me.z - bulb.z) <=
        LAMPS.haloRadius + 0.5;
    if (zap && bulb && !inLight && zap.gap > 0.5 && zap.gap <= ZAP.range * 0.97)
      return {
        weapon: 'zap',
        aim: {
          x: (bulb.x - me.x) / zap.gap,
          y: 0,
          z: (bulb.z - me.z) / zap.gap,
        },
      };
    let foe: WorldView['moths'][number] | undefined;
    let gap = Infinity;
    for (const moth of view.moths) {
      if (moth.team === team || moth.respawning || moth.zapped) continue;
      const distance = Math.hypot(moth.x - me.x, moth.z - me.z);
      if (distance < gap) {
        gap = distance;
        foe = moth;
      }
    }
    if (!foe || gap < 1e-3) return undefined;
    const aim = { x: (foe.x - me.x) / gap, y: 0, z: (foe.z - me.z) / gap };
    const punch =
      gap < BOSH.range * 0.95 && Math.abs(foe.y - me.y) < BOSH.reach;
    if (punch && random() < BOT.boshChance) return { weapon: 'bosh', aim };
    if (gap < GUST.range * 0.9) return { weapon: 'gust', aim };
    return undefined;
  }

  return {
    team,
    reset,
    tick(view: WorldView, state: MatchView): BotOrder {
      const id = state.active;
      if (state.team !== team || id === undefined) {
        reset();
        return IDLE;
      }
      const me = view.moths[id];
      switch (state.phase) {
        case 'plan': {
          thinking += DT;
          if (thinking < BOT.thinkSeconds) return IDLE;
          const wait = thinking;
          reset();
          thinking = wait;
          target = chooseTarget(view, id, state);
          return { type: 'start' };
        }
        case 'move': {
          thinking = 0;
          target ??= chooseTarget(view, id, state);
          walking += DT;
          const dx = (target?.x ?? me?.x ?? 0) - (me?.x ?? 0);
          const dz = (target?.z ?? me?.z ?? 0) - (me?.z ?? 0);
          const gap = Math.hypot(dx, dz);
          if (gap >= 0.5 && walking < BOT.walkSeconds && settling === 0) {
            stuck = gap > lastGap - 0.01 ? stuck + 1 : 0;
            lastGap = gap;
            return {
              type: 'walk',
              x: dx / gap,
              z: dz / gap,
              // Hop and flutter over whatever is in the way.
              jump: stuck > 6 && !!me?.grounded,
              flutter: stuck > 6,
            };
          }
          // Stand still for a moment so the shot is lined up from rest.
          settling += DT;
          if (settling < 0.33) return IDLE;
          return { type: 'aim' };
        }
        case 'settle':
          return IDLE;
        case 'aim': {
          if (!shotChosen) {
            shot = chooseShot(view, id, state);
            shotChosen = true;
          }
          aiming += DT;
          if (shot && aiming < BOT.aimSeconds) return { type: 'aim', shot };
          const order: BotOrder = shot
            ? { type: 'fire', shot }
            : { type: 'dance' };
          reset();
          return order;
        }
        default:
          reset();
          return IDLE;
      }
    },
  };
}

export type Bot = ReturnType<typeof createBot>;
