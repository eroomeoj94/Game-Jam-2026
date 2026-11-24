import {
  AIM,
  ARENA,
  BOSH,
  DANCE,
  HAZARD,
  LAMPS,
  MATCH,
  MAX_FRAME_MS,
  MIND,
  PHYSICS_STEP_MS,
  TEAM_LABELS,
  WEAPONS,
  ZAP,
} from './config';
import { createMatch, crowdedSpot, lampControl } from './game/match';
import type { LampControl, MatchView } from './game/match';
import { createWorld } from './game/world';
import { nearLampPlacement, restingLightRadius } from './game/spawns';
import type { WorldEvent, WorldView } from './game/world';
import { createBot } from './input/bot';
import type { Bot, BotOrder } from './input/bot';
import { createGamepadInput } from './input/gamepad';
import { createPlayerInput } from './input/player';
import { createScene } from './view/scene';
import { createSfx } from './audio/sfx';
import type { MothCue } from './audio/sfx';
import type { WeaponId } from './config';
import { createTuningPanel, loadSavedTuning } from './ui/tuning';

export type ApplicationOptions = {
  /** Scatter moths across the desk at random (on by default). */
  randomSpawns?: boolean;
  /**
   * 'match' plays rounds, turns and scoring. 'playground' is free play with
   * every moth and weapon, for tuning. Defaults to the page's ?playground flag.
   */
  mode?: 'match' | 'playground';
  /** Giant hands smack the desk at random (on by default). */
  hands?: boolean;
  /** The computer plays Teal from the start, as the '1 player' button does. */
  solo?: boolean;
  /** Two computers play a match behind the start screen (on by default). */
  attract?: boolean;
};

const COACHED_KEY = 'moth-fight-club:coached';
/** Small flags kept between visits; storage may be blocked, so never rely on it. */
function recall(key: string) {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}
function remember(key: string) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Without storage the tips simply show again next visit.
  }
}

/** The team the computer plays in a one-player match: Teal, who goes second. */
const BOT_TEAM = 1;

const teamLabel = (team: number) =>
  `${TEAM_LABELS[team]?.icon ?? '?'} ${TEAM_LABELS[team]?.name ?? `Team ${team + 1}`}`;
/** One line on each weapon, shown in the middle of the weapon wheel. */
const WEAPON_ABOUT: Record<WeaponId, string> = {
  gust: 'Shoves every rival in front of you',
  bosh: 'One big punch, close up',
  zap: 'Turns a lamp into a bug zapper',
  cap: 'Hold to charge, release to flick',
  firecracker: 'Hold to charge, lob it and run',
  mind: 'Once a match: make a giant slam where you choose',
};
/** What to call each giant while a Mind Control is choosing between them. */
const GIANT_NAMES = ['the lad', 'the old man', 'Joe'];
const NO_MOVEMENT = { x: 0, z: 0, jump: false, flutter: false };

export function startApplication({
  randomSpawns = true,
  mode = new URLSearchParams(location.search).has('playground')
    ? 'playground'
    : 'match',
  hands = true,
  solo = false,
  attract = true,
}: ApplicationOptions = {}) {
  const playing = mode === 'match';
  const newWorld = () =>
    createWorld({
      placement: randomSpawns ? nearLampPlacement() : undefined,
      match: playing,
      // A match times its own smacks; free play gets them at random.
      hazards: hands && !playing,
      attention: hands ? (playing ? 'hold' : 'strike') : undefined,
    });
  const newMatch = () =>
    playing
      ? createMatch(
          ARENA.spawns.map(({ team }) => team),
          { lamps: LAMPS.count },
        )
      : undefined;
  const host = document.querySelector<HTMLDivElement>('#game');
  const status = document.querySelector<HTMLParagraphElement>('#status');
  const nudge = document.querySelector<HTMLButtonElement>('#nudge');
  const reset = document.querySelector<HTMLButtonElement>('#reset');
  const camera = document.querySelector<HTMLButtonElement>('#camera');
  const view = document.querySelector<HTMLButtonElement>('#view');
  const fuel = document.querySelector<HTMLProgressElement>('#flutter');
  const fuelText = document.querySelector<HTMLElement>('#flutter-value');
  const controllerStatus =
    document.querySelector<HTMLElement>('#controller-status');
  const weaponBar = document.querySelector<HTMLElement>('#weapons');
  const charge = document.querySelector<HTMLProgressElement>('#charge');
  const chargeText = document.querySelector<HTMLElement>('#charge-value');
  const zaps = document.querySelector<HTMLElement>('#zaps');
  const mute = document.querySelector<HTMLButtonElement>('#mute');
  const music = document.querySelector<HTMLButtonElement>('#music');
  const mothBar = document.querySelector<HTMLElement>('#moths');
  const modeTag = document.querySelector<HTMLElement>('#mode');
  const score = document.querySelector<HTMLElement>('#score');
  const lampBar = document.querySelector<HTMLElement>('#lamps');
  const moveMeter = document.querySelector<HTMLElement>('#move-meter');
  const move = document.querySelector<HTMLProgressElement>('#move');
  const moveText = document.querySelector<HTMLElement>('#move-value');
  const pass = document.querySelector<HTMLButtonElement>('#pass');
  const banner = document.querySelector<HTMLElement>('#banner');
  const intro = document.querySelector<HTMLElement>('#intro');
  const start = document.querySelector<HTMLButtonElement>('#start');
  const startSolo = document.querySelector<HTMLButtonElement>('#start-solo');
  const again = document.querySelector<HTMLButtonElement>('#again');
  const scoreboard = document.querySelector<HTMLElement>('#scoreboard');
  const caption = document.querySelector<HTMLElement>('.caption');
  const demoTag = document.querySelector<HTMLElement>('#demo-tag');
  const menu = document.querySelector<HTMLElement>('#menu');
  const resume = document.querySelector<HTMLButtonElement>('#resume');
  const quit = document.querySelector<HTMLButtonElement>('#quit');
  const coach = document.querySelector<HTMLElement>('#coach');
  const coachText = document.querySelector<HTMLElement>('#coach-text');
  const coachHide = document.querySelector<HTMLButtonElement>('#coach-hide');
  const countdown = document.querySelector<HTMLElement>('#countdown');
  const splatcam = document.querySelector<HTMLElement>('#splatcam');
  const paused = document.querySelector<HTMLElement>('#paused');
  const help = document.querySelector<HTMLElement>('#help');
  const helpToggle = document.querySelector<HTMLButtonElement>('#help-toggle');
  if (
    !host ||
    !status ||
    !nudge ||
    !reset ||
    !camera ||
    !view ||
    !fuel ||
    !fuelText ||
    !controllerStatus ||
    !weaponBar ||
    !charge ||
    !chargeText ||
    !zaps ||
    !mute ||
    !mothBar ||
    !modeTag ||
    !score ||
    !lampBar ||
    !moveMeter ||
    !move ||
    !moveText ||
    !pass ||
    !banner ||
    !intro ||
    !start ||
    !paused ||
    !help ||
    !helpToggle
  )
    throw new Error('Missing scene controls.');
  loadSavedTuning();
  const scene = createScene(host);
  const sfx = createSfx();
  let world = newWorld();
  let match = newMatch();
  let bot: Bot | undefined = playing && solo ? createBot(BOT_TEAM) : undefined;
  // Until Start is pressed, two computers play each other behind the title.
  const demoBots = playing && attract ? [createBot(0), createBot(1)] : [];
  let demoWon = 0;
  /** Teams the announcer has already called match point for. */
  const matchPointCalled = new Set<number>();
  /** Moths on their way off the desk because they were zapped. */
  const zappedOut = new Set<number>();
  /**
   * The acting moth's line, held until the frame's sounds have played so the
   * announcer gets the first word.
   */
  let pendingQuip: { moth: number; cue: MothCue } | undefined;
  /** Where the round's smack is landing, while the camera is held on it. */
  let smackSpot:
    { x: number; z: number; from?: { x: number; z: number } } | undefined;
  let countShown = 0;
  const gamepad = createGamepadInput();
  const keyboard = createPlayerInput(
    selectMoth,
    toggleView,
    (step) => stepWeapon(step),
    passTurn,
  );
  // One button per moth, in team colours; keys 1–8 match the numbers.
  const selectors = ARENA.spawns.map(({ name, team }, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `moth-${index}`;
    button.dataset.moth = String(index);
    button.dataset.team = String(team);
    button.setAttribute('aria-pressed', String(index === 0));
    button.textContent = `${index + 1} · ${name}`;
    mothBar.appendChild(button);
    return button;
  });
  // The character badge, the weapon chip beside it and the weapon wheel.
  const aimHint = document.querySelector<HTMLElement>('#aim-hint');
  const aimGiant = document.querySelector<HTMLElement>('#aim-giant');
  const badge = document.querySelector<HTMLElement>('#badge');
  const badgeFace = document.querySelector<HTMLImageElement>('#badge-face');
  const badgeNumber = document.querySelector<HTMLElement>('#badge-number');
  const badgeTeam = document.querySelector<HTMLElement>('#badge-team');
  const badgeName = document.querySelector<HTMLElement>('#badge-name');
  const flutterArc = document.querySelector<SVGPathElement>('#flutter-arc');
  const powerArc = document.querySelector<SVGPathElement>('#power-arc');
  const wheel = document.querySelector<HTMLElement>('#wheel');
  const wheelName = document.querySelector<HTMLElement>('#wheel-name');
  const wheelAbout = document.querySelector<HTMLElement>('#wheel-about');
  const chip = document.querySelector<HTMLButtonElement>('#weapon-chip');
  const chipIcon =
    document.querySelector<HTMLImageElement>('#weapon-chip-icon');
  const chipName = document.querySelector<HTMLElement>('#weapon-chip-name');
  const asset = (name: string) => `${import.meta.env.BASE_URL}ui/${name}.webp`;
  // The wheel's buttons sit evenly round a circle, the first at the top.
  const weaponCounts: HTMLElement[] = [];
  const weaponButtons = WEAPONS.map((weapon, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.weapon = weapon.id;
    button.setAttribute('aria-label', weapon.name);
    const angle = (index / WEAPONS.length) * Math.PI * 2 - Math.PI / 2;
    button.style.setProperty('--x', Math.cos(angle).toFixed(4));
    button.style.setProperty('--y', Math.sin(angle).toFixed(4));
    const icon = document.createElement('img');
    icon.src = asset(`weapon-${weapon.id}`);
    icon.alt = '';
    const count = document.createElement('span');
    count.className = 'wheel-count';
    count.hidden = true;
    button.append(icon, count);
    weaponCounts.push(count);
    button.addEventListener('pointerenter', () => {
      if (!button.disabled) selectWeapon(index);
    });
    button.addEventListener('click', () => {
      selectWeapon(index);
      setWheel(false);
    });
    weaponBar.appendChild(button);
    return button;
  });
  // The help panel lists every weapon with its icon and what it does.
  const weaponHelp = document.querySelector<HTMLElement>('#weapon-help');
  const weaponHelpItems = WEAPONS.map((weapon) => {
    const item = document.createElement('li');
    const icon = document.createElement('img');
    icon.src = asset(`weapon-${weapon.id}`);
    icon.alt = '';
    const name = document.createElement('b');
    name.textContent = weapon.name;
    item.append(icon, name, ` ${WEAPON_ABOUT[weapon.id]}`);
    weaponHelp?.appendChild(item);
    return item;
  });
  let weaponIndex = 0;
  let wheelOpen = false;
  /** Whether the controller's L2 was holding the wheel open last frame. */
  let padWheel = false;
  function setWheel(open: boolean) {
    const next = open && started && !menuOpen && !botTurn();
    if (!wheel || wheelOpen === next) return;
    wheelOpen = next;
    wheel.hidden = !next;
    chip?.setAttribute('aria-expanded', String(next));
    if (next) cancelAim();
    else focusCanvas();
  }
  const onWheelKey = (event: KeyboardEvent) => {
    if (event.code === 'Escape' && wheelOpen && event.type === 'keydown') {
      // Esc shuts the wheel rather than opening the menu behind it.
      event.stopImmediatePropagation();
      setWheel(false);
      return;
    }
    if (event.code !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey)
      return;
    if (!started) return;
    event.preventDefault();
    if (!event.repeat) setWheel(event.type === 'keydown');
  };
  const onWheelClick = (event: MouseEvent) => {
    if (event.target === wheel) setWheel(false);
  };
  const onChip = () => setWheel(!wheelOpen);
  // Aiming starts when fire is pressed and fires when it is released.
  let aiming = false;
  let power = 0;
  let hitstop = 0;
  let accumulator = 0;
  let previousTime: number | undefined;
  let seconds = 0;
  let frame = 0;
  let disposed = false;
  let unfocused = false;
  /** The pause menu is open and the match is frozen behind it. */
  let menuOpen = false;
  /** First-match tips, until the player hides them or finishes two rounds. */
  let coaching = !recall(COACHED_KEY);
  // Nothing responds until Start is pressed on the title screen.
  let started = false;
  /** Seconds until the winning team's next round of dancing. */
  let partyTimer = 0;
  let wasRespawning = false;
  let pointerStart: { x: number; y: number; id: number } | undefined;

  /** True while the computer, not a person, is playing the current go. */
  function pilot() {
    const turn = match?.view();
    if (!turn || !['plan', 'move', 'settle', 'aim'].includes(turn.phase))
      return undefined;
    if (!started) return demoBots[turn.team];
    return bot?.team === turn.team ? bot : undefined;
  }
  const botTurn = () => !!pilot();
  /** Carry out the computer's order; returns how its moth should move. */
  function obey(order: BotOrder) {
    if (!match) return NO_MOVEMENT;
    if (order.type === 'start') match.startMove();
    else if (order.type === 'walk') return order;
    else if (order.type === 'aim') {
      if (match.view().phase === 'move' && started)
        sfx.quip(world.snapshot().selectedMoth, 'move');
      match.beginAim();
      scene.setAim(
        order.shot
          ? {
              ...order.shot,
              power: 1,
              lamp:
                order.shot.weapon === 'zap'
                  ? world.zapTarget(order.shot.aim)
                  : undefined,
            }
          : undefined,
      );
    } else if (order.type === 'fire') {
      scene.setAim(undefined);
      const { weapon, aim } = order.shot;
      const lamp = weapon === 'zap' ? world.zapTarget(aim) : undefined;
      const moth = world.snapshot().selectedMoth;
      if (match.canUse(weapon) && world.useWeapon(weapon, aim)) {
        match.fired(weapon, lamp);
        if (weapon !== 'bosh' && weapon !== 'mind')
          pendingQuip = { moth, cue: weapon };
      } else if (match.pass()) {
        world.dance();
        pendingQuip = { moth, cue: 'dance' };
      }
    } else if (order.type === 'dance' && match.pass()) {
      world.dance();
      pendingQuip = { moth: world.snapshot().selectedMoth, cue: 'dance' };
    }
    return NO_MOVEMENT;
  }
  function focusCanvas() {
    host?.querySelector('canvas')?.focus({ preventScroll: true });
  }
  function clearInput() {
    keyboard.clear();
    gamepad.clear();
    cancelAim();
  }
  function cancelAim() {
    if (mindRaisedView) {
      mindRaisedView = false;
      if (scene.viewMode?.() === 'board') toggleView();
    }
    if (aimHint) aimHint.hidden = true;
    mindSpot = undefined;
    mindGiant = undefined;
    aiming = false;
    power = 0;
    scene.setAim(undefined);
  }
  function selectWeapon(index: number) {
    weaponIndex = (index + WEAPONS.length) % WEAPONS.length;
    weaponButtons.forEach((button, i) =>
      button.setAttribute('aria-pressed', String(i === weaponIndex)),
    );
    const weapon = WEAPONS[weaponIndex]!;
    scene.setWeapon?.(weapon.id);
    setText(wheelName, weapon.name);
    setText(wheelAbout, WEAPON_ABOUT[weapon.id]);
    setText(chipName, weapon.name);
    const icon = asset(`weapon-${weapon.id}`);
    if (chipIcon && !chipIcon.src.endsWith(icon)) chipIcon.src = icon;
    power = 0;
  }
  /** Where a Mind Control slam is aimed, and which giant will do it. */
  let mindSpot: { x: number; z: number } | undefined;
  let mindGiant: number | undefined;
  /** True while the board view is up only for aiming a Mind Control. */
  let mindRaisedView = false;
  /** The way the player is steering, in desk directions, from the last step. */
  let steering = { x: 0, z: 0 };
  /** Q / E and the D-pad pick the giant while a Mind Control is aimed. */
  function stepWeapon(step: number) {
    const people = world.snapshot().people.length;
    if (aiming && WEAPONS[weaponIndex]?.id === 'mind' && people) {
      mindGiant =
        ((mindGiant ?? nearestGiant(world.snapshot())) + step + people) %
        people;
      return;
    }
    selectWeapon(weaponIndex + step);
  }
  /** The giant standing nearest the spot being aimed at. */
  function nearestGiant(view: WorldView) {
    let best = 0;
    let gap = Infinity;
    view.people.forEach((person, index) => {
      const far = Math.hypot(
        person.x - (mindSpot?.x ?? 0),
        person.z - (mindSpot?.z ?? 0),
      );
      if (far < gap) {
        gap = far;
        best = index;
      }
    });
    return best;
  }
  /** Aim a Mind Control: steer the target, pick a giant, release to slam. */
  function aimMind(view: WorldView, fireHeld: boolean, deltaSeconds: number) {
    const active = view.moths[view.selectedMoth]!;
    const halfWide = ARENA.desk.width / 2 - HAZARD.radius * 0.5;
    const halfDeep = ARENA.desk.depth / 2 - HAZARD.radius * 0.5;
    if (!mindSpot) {
      // Choosing a spot on the desk needs the whole desk in view.
      if (scene.viewMode?.() === 'follow') {
        toggleView();
        mindRaisedView = true;
      }
      const aim = scene.aimDirection(view);
      const flat = Math.hypot(aim.x, aim.z) || 1;
      mindSpot = {
        x: active.x + (aim.x / flat) * MIND.startAhead,
        z: active.z + (aim.z / flat) * MIND.startAhead,
      };
    }
    mindSpot.x = Math.max(
      -halfWide,
      Math.min(
        halfWide,
        mindSpot.x + steering.x * MIND.aimSpeed * deltaSeconds,
      ),
    );
    mindSpot.z = Math.max(
      -halfDeep,
      Math.min(
        halfDeep,
        mindSpot.z + steering.z * MIND.aimSpeed * deltaSeconds,
      ),
    );
    const giant = mindGiant ?? nearestGiant(view);
    const aim = {
      x: mindSpot.x - active.x,
      y: 0,
      z: mindSpot.z - active.z,
    };
    if (fireHeld) {
      if (aimHint) aimHint.hidden = false;
      setText(aimGiant, `Controlling ${GIANT_NAMES[giant] ?? 'a giant'}`);
      scene.setAim({ weapon: 'mind', aim, power: 0, spot: mindSpot, giant });
      return;
    }
    if (world.commandSmack(mindSpot, giant)) match?.fired('mind');
    cancelAim();
  }
  /** Hold to aim (and charge), release to fire. */
  function updateWeapon(fireHeld: boolean, deltaSeconds: number) {
    const weapon = WEAPONS[weaponIndex];
    const view = world.snapshot();
    const active = view.moths[view.selectedMoth];
    const ready =
      !!active &&
      !active.respawning &&
      !active.zapped &&
      (!match || match.canUse(weapon?.id ?? 'gust'));
    if (!weapon || !ready) {
      if (aiming) cancelAim();
      return;
    }
    if (fireHeld && !aiming && view.weaponCooldown === 0) {
      // In a match, starting to aim ends movement and freezes the world.
      const moved = match?.view().phase === 'move';
      if (match && !match.beginAim()) return;
      // Winding up a Bosh is left to the announcer: no moth talks over him.
      if (moved && weapon.id !== 'bosh') sfx.quip(view.selectedMoth, 'move');
      aiming = true;
      power = 0;
    }
    if (!aiming) return;
    if (weapon.id === 'mind') {
      aimMind(view, fireHeld, deltaSeconds);
      return;
    }
    const aim = scene.aimDirection(view);
    if (fireHeld) {
      if (weapon.charge)
        power = Math.min(1, power + deltaSeconds / AIM.chargeSeconds);
      scene.setAim({
        weapon: weapon.id,
        aim,
        power,
        lamp: weapon.id === 'zap' ? world.zapTarget(aim) : undefined,
      });
      return;
    }
    const lamp = weapon.id === 'zap' ? world.zapTarget(aim) : undefined;
    // A shot that cannot be taken (no lamp in line, say) leaves the turn open.
    if (world.useWeapon(weapon.id, aim, weapon.charge ? power : 1)) {
      match?.fired(weapon.id, lamp);
      // A Bosh belongs to the announcer: the moth keeps quiet.
      if (weapon.id !== 'bosh')
        pendingQuip = { moth: view.selectedMoth, cue: weapon.id };
    }
    cancelAim();
  }
  /** End the turn without attacking: the moth dances instead. */
  function passTurn() {
    if (!started || botTurn()) return;
    if (match && !match.pass()) return;
    world.dance();
    pendingQuip = { moth: world.snapshot().selectedMoth, cue: 'dance' };
    cancelAim();
    focusCanvas();
  }
  function selectMoth(id: number) {
    if (!started || botTurn()) return;
    if (match && !match.select(id)) return;
    if (!world.selectMoth(id)) return;
    clearInput();
    wasRespawning = false;
    updateHUD(world.snapshot());
    focusCanvas();
  }
  function toggleView() {
    const mode = scene.toggleView();
    if (view) {
      view.textContent = mode === 'follow' ? 'Board view' : 'Shoulder view';
      view.setAttribute('aria-pressed', String(mode === 'board'));
    }
  }
  /** Keep the two sound switches in the menu in step with the mixer. */
  function updateSoundLabel() {
    const show = (
      button: HTMLButtonElement | null,
      name: string,
      on: boolean,
    ) => {
      if (!button) return;
      const label = `${name} ${on ? 'on' : 'off'}`;
      if (button.textContent?.trim() !== label) button.textContent = label;
      if (button.getAttribute('aria-pressed') !== String(on))
        button.setAttribute('aria-pressed', String(on));
    };
    show(music, 'Music', sfx.music);
    show(mute, 'Sound effects', sfx.effects);
  }
  /** After a win the world runs on and the winners dance until New match. */
  function celebrate(winner: number | undefined) {
    world.step(NO_MOVEMENT);
    partyTimer -= PHYSICS_STEP_MS / 1000;
    if (partyTimer > 0) return;
    partyTimer = DANCE.seconds + 0.3;
    const before = world.snapshot();
    for (const moth of before.moths)
      if (moth.team === winner && !moth.respawning && world.selectMoth(moth.id))
        world.dance();
    world.selectMoth(before.selectedMoth);
  }
  /** Tell the match what the world just did. */
  function reportToMatch(view: WorldView, events: readonly WorldEvent[]) {
    if (!match) return;
    for (const event of events)
      if (event.type === 'zap') {
        match.zapped(event.team);
        zappedOut.add(event.moth);
      }
    for (const moth of view.moths)
      if (moth.respawning && !match.isResting(moth.id)) {
        match.mothOut(moth.id);
        // A zapped moth has had its line already; this one fell or was flung.
        if (!zappedOut.delete(moth.id) && started) {
          sfx.say('fall');
          // Say what it costs, where the moth went over the edge.
          const half = {
            x: ARENA.desk.width / 2 - 2,
            z: ARENA.desk.depth / 2 - 2,
          };
          scene.showNote?.(
            `${ARENA.spawns[moth.id]?.name ?? 'Moth'} is off the desk · misses a round`,
            {
              x: Math.max(-half.x, Math.min(half.x, moth.x)),
              z: Math.max(-half.z, Math.min(half.z, moth.z)),
            },
            moth.team,
          );
        }
      }
  }
  /** Carry out what the match decided: returns, handovers, lamp changes. */
  function applyMatchEvents() {
    if (!match) return;
    for (const event of match.drainEvents()) {
      if (event.type === 'return')
        event.moths.forEach((id) => world.returnMoth(id));
      else if (event.type === 'lamp-restored') world.restoreLamp(event.lamp);
      else if (event.type === 'strike') world.strike();
      else if (event.type === 'banked') {
        scene.showScores(event.awards, world.snapshot(), event.points);
        sfx.chime(event.awards.filter((team) => team !== undefined).length);
        // One call of "Match point!" per team, when it gets within a hot lamp.
        const close = match
          .view()
          .scores.findIndex(
            (points, team) =>
              points >= MATCH.targetScore - MATCH.hotPoints &&
              !matchPointCalled.has(team),
          );
        if (close >= 0) {
          matchPointCalled.add(close);
          sfx.say('matchpoint', { priority: 2 });
        } else sfx.say('bank', { chance: 0.6 });
      } else if (event.type === 'hot') world.setHotLamp(event.lamp);
      else if (event.type === 'lamp-dark') {
        world.setLampDark(event.lamp, event.dark);
        // Loud and on top of everything: this is the call players miss.
        if (event.dark) sfx.say('burn', { priority: 3 });
        const lamp = world.snapshot().lamps[event.lamp];
        if (lamp)
          scene.showNote?.(
            event.dark
              ? `Burnt out · no points here for ${MATCH.burnRounds === 1 ? 'a round' : `${MATCH.burnRounds} rounds`}`
              : 'Relit · worth points again',
            { x: lamp.anchor.x, y: lamp.base, z: lamp.anchor.z },
            -1,
          );
      } else if (event.type === 'won') {
        sfx.fanfare();
        sfx.say(
          bot?.team === event.team
            ? 'winEnd'
            : event.team === 0
              ? 'win0'
              : 'win1',
          { priority: 3 },
        );
        partyTimer = 0;
      } else if (event.type === 'threat') {
        // Round one is covered by the opening line.
        if (started && event.round > 1)
          sfx.say(
            match.view().hot !== undefined && Math.random() < 0.4
              ? 'hot'
              : event.round === 2
                ? 'round2'
                : event.round === 3
                  ? 'round3'
                  : 'round',
            { priority: 2 },
          );
        const view = world.snapshot();
        const spot =
          hands && MATCH.roundSmack && !view.hazards.length
            ? crowdedSpot(view, LAMPS.haloRadius)
            : undefined;
        if (spot) world.threaten(spot);
      } else if (event.type === 'turn') {
        if (event.moth !== undefined) world.selectMoth(event.moth);
        // The first go of a team's turn: call them up, some of the time.
        if (started && match.view().acted.length === 0)
          sfx.say(event.team === 0 ? 'turn0' : 'turn1', { chance: 0.6 });
        // Keys still held by the last player must not move the next moth.
        clearInput();
        wasRespawning = false;
      }
    }
    // A moth that found no clear spot to return to sits out again.
    reportToMatch(world.snapshot(), []);
  }
  function tickMatch(view: WorldView) {
    if (!match) return;
    const active = match.view().active;
    match.tick(PHYSICS_STEP_MS / 1000, {
      grounded: active === undefined || (view.moths[active]?.grounded ?? true),
      // The go ends once nothing is flying, tumbling, sliding or dancing.
      busy:
        view.projectiles.length > 0 ||
        // A hand ordered down by Mind Control is still on its way.
        view.hazards.some((hazard) => !hazard.held) ||
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
    applyMatchEvents();
  }
  /** Let the moths drop onto the desk before the first turn freezes them. */
  function settleWorld() {
    if (!match) return;
    for (let tick = 0; tick < 30; tick++) world.step();
    world.drainEvents();
    applyMatchEvents();
  }
  function stopCoaching() {
    coaching = false;
    remember(COACHED_KEY);
  }
  /** What to do next, for someone playing their first match. */
  function coachMessage(state: MatchView, view: WorldView) {
    if (!coaching || !started || state.phase === 'won') return '';
    if (state.round > 2) {
      stopCoaching();
      return '';
    }
    if (state.phase === 'smack')
      return 'Here comes the hand. Any moth under it is flung away.';
    if (state.round === 2 && state.phase === 'plan' && state.acted.length === 0)
      return 'Lamps 4, 5 and 6 hang over the boxes and the book tower. Hold Space to flutter up: the hand cannot reach you there, but mind the drop.';
    if (state.resting.length && state.phase === 'plan')
      return 'A moth knocked off the desk misses its next round. Shove rivals over the edge with a gust or a Bosh.';
    if (state.phase === 'scored')
      return state.dark.length
        ? 'A lamp that pays you twice running burns out for a round (✕). Keep moving.'
        : 'A lamp only pays out if you still hold it after your rival has replied.';
    if (state.phase === 'resolve') return '';
    if (bot && state.team === bot.team)
      return 'The computer replies. Lamps you still hold when it finishes score for you.';
    const active =
      state.active === undefined ? undefined : view.moths[state.active];
    const inLight =
      !!active &&
      view.lamps.some(
        (lamp) =>
          !lamp.zapper &&
          Math.hypot(active.x - lamp.x, active.y - lamp.y, active.z - lamp.z) <=
            LAMPS.haloRadius,
      );
    const hand = view.hazards.length
      ? ' ✋ on the scoreboard marks the lamp the hand will swat this round.'
      : '';
    if (state.phase === 'plan')
      return state.round === 1 && state.acted.length === 0
        ? `Walk a moth into the ring of light under a lamp: WASD to move, Space to hop.${
            state.hot === undefined
              ? ''
              : ` The pulsing lamp (★ ${state.hot + 1}) is worth ${MATCH.hotPoints} this round.`
          }`
        : `Each of your moths gets one go. Move this one, or pick another with 1–8.${hand}`;
    if (state.phase === 'move' || state.phase === 'settle')
      return inLight
        ? 'In the light. Hold F to aim and release to fire, or press P to dance and end this go.'
        : `Head for the ring of light under a lamp. Then hold F to aim, or press P to dance.${hand}`;
    return 'Line up a rival and let go of F. Q / E changes weapon: Wing Gust shoves, Bosh hits hard but the noise draws the hand.';
  }
  function turnMessage(state: MatchView, mothName: string) {
    const team = teamLabel(state.team);
    if (state.phase === 'won' && bot)
      return state.winner === bot.team
        ? 'The computer wins · press Play again for a rematch'
        : 'You win! · press Play again';
    if (botTurn()) return `${team} · ${mothName} · the computer is playing…`;
    const zapOut =
      WEAPONS[weaponIndex]?.id === 'zap' && state.zapSwitches[state.team] === 0;
    switch (state.phase) {
      case 'plan':
        return `${team} · ${mothName} · pick a moth, then move or hold F to aim`;
      case 'move':
        return `${team} · ${mothName} · moving · hold F to stop and aim`;
      case 'settle':
        return `${team} · ${mothName} · landing…`;
      case 'aim':
        return zapOut
          ? `${team} · ${mothName} · no Zap Switches left · pick another weapon or dance`
          : `${team} · ${mothName} · hold F to aim, release to fire · P: dance instead`;
      case 'resolve':
        return state.active === undefined
          ? `${team} · nobody on the desk · turn passes`
          : `${team} · ${mothName} · resolving…`;
      case 'smack':
        return `Round ${state.round} · here comes the hand…`;
      case 'scored':
        return MATCH.scoring === 'incoming'
          ? `${teamLabel((state.team + 1) % TEAM_LABELS.length)} banks the lamps it held · ${teamLabel(state.team)} has played`
          : `Round ${state.round} scored · next round coming up`;
      case 'won':
        return `${teamLabel(state.winner ?? 0)} wins · press New match`;
    }
  }
  function bannerMessage(state: MatchView) {
    const tally = (awards: readonly (number | undefined)[]) =>
      TEAM_LABELS.map(
        (_, team) =>
          `${teamLabel(team)} +${awards.filter((holder) => holder === team).length}`,
      ).join(' · ');
    if (state.phase === 'plan')
      return `${teamLabel(state.team)}'s turn · ${
        state.goesLeft === 1 ? 'last moth' : `${state.goesLeft} moths to go`
      }${state.hot === undefined ? '' : ` · ★ lamp ${state.hot + 1} pays ${MATCH.hotPoints}`}`;
    if (state.phase === 'scored' && MATCH.scoring === 'incoming') {
      const banker = (state.team + 1) % TEAM_LABELS.length;
      const lamps = state.awards.filter((holder) => holder === banker).length;
      const points = state.awards.reduce<number>(
        (sum, holder, lamp) =>
          holder === banker ? sum + (state.points[lamp] ?? 1) : sum,
        0,
      );
      return `${teamLabel(banker)} ${
        lamps
          ? `banks ${lamps} lamp${lamps === 1 ? '' : 's'} · +${points}`
          : 'held no lamps'
      }`;
    }
    if (state.phase === 'scored')
      return `Round ${state.round} · ${tally(state.awards)}`;
    if (state.phase === 'won' && bot)
      return `${state.winner === bot.team ? 'The computer wins' : 'You win!'} · ${state.scores.join(' – ')}`;
    if (state.phase === 'won')
      return `${teamLabel(state.winner ?? 0)} wins ${state.scores.join(' – ')}`;
    return '';
  }
  function lampChip(lamp: LampControl) {
    if (lamp.zapper) return { state: 'zapper', mark: '⚡', text: 'bug zapper' };
    if (lamp.dark) return { state: 'dark', mark: '✕', text: 'burnt out' };
    if (lamp.holder !== undefined)
      return {
        state: `team-${lamp.holder}`,
        mark: TEAM_LABELS[lamp.holder]?.icon ?? '?',
        text: `held by ${TEAM_LABELS[lamp.holder]?.name}`,
      };
    if (lamp.contested) return { state: 'contested', mark: '=', text: 'tied' };
    return { state: 'empty', mark: '·', text: 'empty' };
  }
  const setText = (element: Element | null, text: string) => {
    if (element && element.textContent !== text) element.textContent = text;
  };
  function updateMatchHUD(view: WorldView, state: MatchView) {
    if (!score || !lampBar || !move || !moveText || !pass || !banner) return;
    // The scoreboard along the top: a big score and a race bar for each team.
    if (scoreboard) scoreboard.hidden = !started;
    setText(document.querySelector('#round-label'), `Round ${state.round}`);
    setText(
      document.querySelector('#target-label'),
      `First to ${MATCH.targetScore}`,
    );
    TEAM_LABELS.forEach((_, team) => {
      const who = !bot ? '' : team === bot.team ? ' · computer' : ' · you';
      setText(
        document.querySelector(`#team-name-${team}`),
        `${teamLabel(team)}${who}`,
      );
      const points = state.scores[team] ?? 0;
      setText(document.querySelector(`#team-score-${team}`), String(points));
      const bar = document.querySelector<HTMLElement>(`#team-bar-${team}`);
      const width = `${Math.round(Math.min(1, Math.max(0, points / MATCH.targetScore)) * 100)}%`;
      if (bar && bar.style.width !== width) bar.style.width = width;
      const block = bar?.closest<HTMLElement>('.team');
      const turn = String(
        state.team === team &&
          ['plan', 'move', 'settle', 'aim', 'resolve'].includes(state.phase),
      );
      if (block && block.dataset.turn !== turn) block.dataset.turn = turn;
    });
    const side = String(state.team);
    if (caption && caption.dataset.team !== side) caption.dataset.team = side;
    setText(
      score,
      `${TEAM_LABELS.map((_, team) => `${teamLabel(team)} ${state.scores[team] ?? 0}`).join(' · ')} · Round ${state.round} · first to ${MATCH.targetScore}`,
    );
    const lamps = lampControl(view, LAMPS.haloRadius);
    while (lampBar.children.length > lamps.length) lampBar.lastChild?.remove();
    while (lampBar.children.length < lamps.length)
      lampBar.appendChild(document.createElement('span'));
    // The lamp a giant hand is hanging over, if it is over one at all.
    const hand = view.hazards[0];
    let threatened = -1;
    let nearest = HAZARD.radius + restingLightRadius();
    view.lamps.forEach((lamp, index) => {
      if (!hand) return;
      const gap = Math.hypot(lamp.anchor.x - hand.x, lamp.anchor.z - hand.z);
      if (gap >= nearest) return;
      nearest = gap;
      threatened = index;
    });
    lamps.forEach((lamp, index) => {
      const chip = lampBar.children[index] as HTMLElement;
      const { state: chipState, mark, text } = lampChip(lamp);
      const swat = index === threatened;
      const bonus = index === state.hot && !lamp.dark;
      setText(
        chip,
        `${index + 1} ${mark}${bonus ? ' ★' : ''}${swat ? ' ✋' : ''}`,
      );
      if (chip.dataset.state !== chipState) chip.dataset.state = chipState;
      const hot = String(bonus);
      if (chip.dataset.hot !== hot) chip.dataset.hot = hot;
      // How high the lamp hangs: 0 on the desk, 1 and 2 for the tiers.
      const base = view.lamps[index]?.base ?? 0;
      const tier = base <= 0 ? '0' : base <= HAZARD.reach + 1 ? '1' : '2';
      if (chip.dataset.tier !== tier) chip.dataset.tier = tier;
      const height =
        tier === '0' ? '' : tier === '1' ? ', up on a box' : ', on the summit';
      const title = `Lamp ${index + 1}${height}: ${text}${bonus ? `, worth ${MATCH.hotPoints} this round` : ''}${swat ? ', hand overhead' : ''}`;
      if (chip.title !== title) chip.title = title;
    });
    // With no move limit there is nothing to meter.
    if (moveMeter) moveMeter.hidden = MATCH.moveSeconds <= 0;
    move.value = state.moveLeft;
    setText(
      moveText,
      state.phase === 'plan' || state.phase === 'move'
        ? `${(state.moveLeft * MATCH.moveSeconds).toFixed(1)}s`
        : 'Spent',
    );
    pass.disabled =
      botTurn() || !['plan', 'move', 'settle', 'aim'].includes(state.phase);
    // The match behind the start screen plays on without announcements.
    const message = started ? bannerMessage(state) : '';
    setText(banner, message);
    banner.hidden = message === '';
    if (again) again.hidden = !started || state.phase !== 'won';
    if (banner.dataset.phase !== state.phase)
      banner.dataset.phase = state.phase;
    weaponButtons.forEach((button, index) => {
      const id = WEAPONS[index]?.id;
      if (id !== 'zap' && id !== 'mind') return;
      const left =
        (id === 'zap' ? state.zapSwitches : state.mindControls)[state.team] ??
        0;
      const count = weaponCounts[index];
      if (count) {
        count.hidden = false;
        setText(count, `×${left}`);
      }
      button.disabled = left === 0;
    });
  }
  function updateHUD(view: WorldView) {
    updateSoundLabel();
    const active = view.moths[view.selectedMoth];
    if (
      !active ||
      !status ||
      !fuel ||
      !fuelText ||
      !charge ||
      !chargeText ||
      !zaps
    )
      return;
    const state = active.zapped
      ? 'ZAPPED!'
      : active.respawning
        ? 'Returning to the desk…'
        : active.fluttering
          ? 'Fluttering'
          : active.grounded
            ? 'Ready to hop'
            : 'In the air';
    const turn = match?.view();
    if (turn) updateMatchHUD(view, turn);
    const tip = turn ? coachMessage(turn, view) : '';
    setText(coachText, tip);
    if (coach) coach.hidden = tip === '';
    const mothName = ARENA.spawns[active.id]?.name ?? 'Moth';
    const side = ARENA.spawns[active.id]?.team ?? 0;
    const message = turn
      ? turnMessage(turn, mothName)
      : `${mothName} · ${state}`;
    if (status.textContent !== message) {
      // The badge already names the team and the moth, so that lead-in is
      // kept for screen readers and only the instruction is shown.
      const lead = `${teamLabel(side)} · ${mothName} · `;
      if (turn && message.startsWith(lead)) {
        const hidden = document.createElement('span');
        hidden.className = 'visually-hidden';
        hidden.textContent = lead;
        status.replaceChildren(hidden, message.slice(lead.length));
      } else status.textContent = message;
    }
    fuel.value = active.flutter;
    setText(fuelText, `${Math.round(active.flutter * 100)}%`);
    // The badge: whose go it is, with flutter and power as arcs round it.
    const face = asset(`face-${side}`);
    if (badgeFace && !badgeFace.src.endsWith(face)) badgeFace.src = face;
    setText(badgeNumber, String(active.id + 1));
    setText(badgeName, mothName);
    setText(badgeTeam, teamLabel(side));
    if (badge && badge.dataset.team !== String(side))
      badge.dataset.team = String(side);
    const dash = (value: number) =>
      `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}, 100`;
    const flutterDash = dash(active.flutter);
    // Set as a style: the stylesheet's dash pattern would beat an attribute.
    if (flutterArc && flutterArc.style.strokeDasharray !== flutterDash)
      flutterArc.style.strokeDasharray = flutterDash;
    const powerDash = dash(aiming ? power : 1 - view.weaponCooldown);
    if (powerArc && powerArc.style.strokeDasharray !== powerDash)
      powerArc.style.strokeDasharray = powerDash;
    const mood = aiming ? 'aiming' : '';
    if (powerArc && powerArc.dataset.mood !== mood)
      powerArc.dataset.mood = mood;
    if (wheelOpen && (botTurn() || menuOpen)) setWheel(false);
    selectors.forEach((button, id) => {
      button.setAttribute('aria-pressed', String(id === view.selectedMoth));
      // A moth knocked off the desk or zapped is marked as sitting out.
      const out = !!turn?.resting.includes(id);
      const label = `${id + 1} · ${ARENA.spawns[id]?.name ?? ''}${out ? ' · out' : ''}`;
      if (button.textContent !== label) button.textContent = label;
      const hint = out ? 'Sitting out: back after missing a round' : '';
      if (button.title !== hint) button.title = hint;
      button.disabled = turn
        ? botTurn() ||
          turn.phase !== 'plan' ||
          ARENA.spawns[id]?.team !== turn.team ||
          turn.resting.includes(id) ||
          turn.acted.includes(id)
        : (view.moths[id]?.respawning ?? true);
    });
    if (active.respawning && !wasRespawning) clearInput();
    wasRespawning = active.respawning;
    charge.value = aiming ? power : 1 - view.weaponCooldown;
    const chargeLabel = aiming
      ? `${Math.round(power * 100)}%`
      : view.weaponCooldown > 0
        ? 'Reloading'
        : 'Ready';
    if (chargeText.textContent !== chargeLabel)
      chargeText.textContent = chargeLabel;
    const tally = `Zapped · ${ARENA.spawns
      .map(({ name, team }) => `${name}'s team ${view.teamZaps[team] ?? 0}`)
      .join(' · ')}`;
    if (zaps.textContent !== tally) zaps.textContent = tally;
  }
  function resetClock() {
    accumulator = 0;
    previousTime = undefined;
    pointerStart = undefined;
  }
  const onVisibilityChange = () => {
    resetClock();
    clearInput();
  };
  const onBlur = () => {
    unfocused = true;
    paused.hidden = !started || menuOpen;
    resetClock();
    clearInput();
  };
  const onFocus = () => {
    unfocused = false;
    paused.hidden = true;
    resetClock();
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button === 0)
      pointerStart = {
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
      };
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = pointerStart;
    pointerStart = undefined;
    if (
      !start ||
      start.id !== event.pointerId ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6
    )
      return;
    const id = scene.pickMoth(event.clientX, event.clientY);
    if (id !== undefined) selectMoth(id);
    focusCanvas();
  };
  const onPointerCancel = () => {
    pointerStart = undefined;
  };
  function render(time: number) {
    if (disposed) return;
    const elapsed =
      previousTime === undefined
        ? 0
        : Math.min(time - previousTime, MAX_FRAME_MS);
    previousTime = time;
    if (!started && !demoBots.length) {
      // The start screen shows the desk but takes no game input.
      if (!document.hidden && !unfocused && !menuOpen) {
        keyboard.clear();
        seconds += elapsed / 1000;
        scene.render(world.snapshot(), seconds);
      }
      frame = requestAnimationFrame(render);
      return;
    }
    if (!document.hidden && !unfocused && !menuOpen) {
      const pad = gamepad.poll();
      if (controllerStatus && controllerStatus.textContent !== pad.text)
        controllerStatus.textContent = pad.text;
      if (!started) {
        // The demo match takes no input, and starts again once it is won.
        keyboard.clear();
        demoWon = match?.view().phase === 'won' ? demoWon + elapsed / 1000 : 0;
        if (demoWon > 6) restart();
      } else if (pad.switchMoth) {
        const current = world.snapshot().selectedMoth;
        const turn = match?.view();
        // In a match the bumpers cycle through the team's moths on the desk.
        const choices = ARENA.spawns.flatMap(({ team }, id) =>
          !turn ||
          (team === turn.team &&
            !turn.resting.includes(id) &&
            !turn.acted.includes(id))
            ? [id]
            : [],
        );
        const next =
          choices[
            (choices.indexOf(current) + pad.switchMoth + choices.length) %
              choices.length
          ];
        if (next !== undefined) selectMoth(next);
      }
      if (started) {
        if (pad.pass) passTurn();
        if (pad.toggleView) toggleView();
        if (pad.resetView) scene.resetCamera();
        scene.orbitCamera(pad.lookX, pad.lookY, elapsed / 1000);
        if (pad.weaponStep) stepWeapon(pad.weaponStep);
        // L2 holds the weapon wheel open; the left stick points at a weapon
        // and letting go of L2 keeps it.
        if (pad.wheel !== padWheel) {
          padWheel = pad.wheel;
          setWheel(pad.wheel);
        }
        if (pad.wheel && wheelOpen && pad.wheelAim) {
          const turn =
            (Math.atan2(pad.wheelAim.z, pad.wheelAim.x) + Math.PI / 2) /
            (Math.PI * 2);
          const pick =
            ((Math.round(turn * WEAPONS.length) % WEAPONS.length) +
              WEAPONS.length) %
            WEAPONS.length;
          if (pick !== weaponIndex && !weaponButtons[pick]?.disabled)
            selectWeapon(pick);
        }
      }
      if (!botTurn())
        updateWeapon(keyboard.fireHeld() || pad.fire, elapsed / 1000);
      seconds += elapsed / 1000;
      // A zap freezes the action for a beat before the moth flies off.
      if (hitstop > 0) hitstop = Math.max(0, hitstop - elapsed / 1000);
      else accumulator += elapsed;
      const events: WorldEvent[] = [];
      while (accumulator >= PHYSICS_STEP_MS) {
        const keys = keyboard.read();
        const controller = gamepad.read();
        const movement = controller.x || controller.z ? controller : keys;
        const jump = keys.jump || controller.jump;
        steering = scene.movementDirection(movement.x, movement.z);
        const command = {
          ...steering,
          jump,
          flutter: keys.flutter || controller.flutter,
        };
        accumulator -= PHYSICS_STEP_MS;
        if (!match) {
          world.step(command);
          continue;
        }
        // On its turn the computer gives the orders and the player's are ignored.
        const order = pilot()?.tick(world.snapshot(), match.view());
        const steer = order ? obey(order) : command;
        // The first movement input locks in the moth and starts its allowance.
        if (!order && (movement.x || movement.z || jump)) match.startMove();
        const turn = match.view();
        // The world is frozen while a player plans, aims or reads the score.
        if (turn.stepping)
          world.step(turn.phase === 'move' ? steer : NO_MOVEMENT);
        else if (turn.phase === 'won') celebrate(turn.winner);
        const stepped = world.drainEvents();
        events.push(...stepped);
        const tickView = world.snapshot();
        reportToMatch(tickView, stepped);
        tickMatch(tickView);
      }
      events.push(...world.drainEvents());
      const view = world.snapshot();
      if (events.some((event) => event.type === 'zap')) {
        hitstop = ZAP.hitstop;
        accumulator = 0;
      } else if (
        events.some(
          (event) => event.type === 'bosh' && event.moth !== undefined,
        )
      ) {
        // A landed punch hangs in the air for a beat.
        hitstop = BOSH.hitstop;
        accumulator = 0;
      }
      // The round's smack: count the hand down and swing the camera onto it,
      // holding there until the dust has settled.
      const smacking = match?.view().phase === 'smack';
      const hand = view.hazards[0];
      if (!smacking) smackSpot = undefined;
      else if (hand) {
        const giant = view.people[hand.person];
        smackSpot = {
          x: hand.x,
          z: hand.z,
          from: giant ? { x: giant.x, z: giant.z } : undefined,
        };
      }
      scene.setSpotlight(smackSpot);
      // A frame and a label sit over the corner splat cam while it runs.
      if (splatcam) {
        const rect = smackSpot?.from ? scene.insetRect?.() : undefined;
        splatcam.hidden = !rect;
        if (rect) {
          splatcam.style.left = `${rect.x}px`;
          splatcam.style.bottom = `${rect.y}px`;
          splatcam.style.width = `${rect.width}px`;
          splatcam.style.height = `${rect.height}px`;
        }
      }
      const count =
        smacking && hand && !hand.held && hand.phase === 'warning'
          ? Math.max(1, Math.ceil((1 - hand.progress) * 3))
          : 0;
      if (count !== countShown) {
        countShown = count;
        if (countdown) {
          countdown.hidden = !count || !started;
          // A fresh element each tick restarts the pop animation.
          const digit = document.createElement('span');
          digit.textContent = count ? String(count) : '';
          countdown.replaceChildren(digit);
        }
        if (count && started) sfx.count(count);
      }
      const listener = scene.listenerPosition();
      if (started) {
        sfx.playEvents(events, listener);
        sfx.update(view, listener);
        if (pendingQuip) sfx.quip(pendingQuip.moth, pendingQuip.cue);
      }
      pendingQuip = undefined;
      scene.playEvents(events, view);
      updateHUD(view);
      scene.render(view, seconds);
    }
    frame = requestAnimationFrame(render);
  }
  const onNudge = () => {
    world.nudgeLamp();
    focusCanvas();
  };
  function restart() {
    clearInput();
    world.destroy();
    world = newWorld();
    match = newMatch();
    bot?.reset();
    demoBots.forEach((demo) => demo.reset());
    demoWon = 0;
    hitstop = 0;
    matchPointCalled.clear();
    settleWorld();
    resetClock();
    seconds = 0;
    wasRespawning = false;
    updateHUD(world.snapshot());
  }
  const onReset = () => {
    setMenu(false);
    restart();
    focusCanvas();
  };
  const onCamera = () => {
    scene.resetCamera();
    focusCanvas();
  };
  const onView = () => {
    toggleView();
    focusCanvas();
  };
  // Browsers only start audio from a user gesture.
  const onFirstGesture = () => sfx.unlock();
  const onMute = () => {
    sfx.unlock();
    sfx.setEffects(!sfx.effects);
    updateSoundLabel();
  };
  const onMusic = () => {
    sfx.unlock();
    sfx.setMusic(!sfx.music);
    updateSoundLabel();
  };
  /** M silences everything, or brings it all back. */
  const onMuteAll = () => {
    sfx.unlock();
    sfx.setMuted(sfx.music || sfx.effects);
    updateSoundLabel();
  };
  const onMuteKey = (event: KeyboardEvent) => {
    if (
      event.code === 'KeyM' &&
      !event.repeat &&
      !event.ctrlKey &&
      !event.metaKey
    )
      onMuteAll();
  };
  const onSelect = (event: Event) => {
    if (event.currentTarget instanceof HTMLButtonElement)
      selectMoth(Number(event.currentTarget.dataset.moth));
  };
  const tuning = createTuningPanel({
    rebuild: onReset,
    recentreCamera: () => scene.resetCamera(),
    nudgeLamps: () => world.nudgeLamp(),
    smack: () => {
      const view = world.snapshot();
      const moth = view.moths[view.selectedMoth];
      if (moth) world.smack({ x: moth.x, z: moth.z });
    },
  });
  const onPass = () => passTurn();
  const onStartSolo = () => {
    bot = playing ? createBot(BOT_TEAM) : undefined;
    onStart();
  };
  const onStart = () => {
    started = true;
    // Clear away the demo match and deal a fresh one.
    if (demoBots.length) restart();
    intro.hidden = true;
    sfx.unlock();
    if (playing) sfx.say('start', { priority: 3 });
    clearInput();
    resetClock();
    focusCanvas();
  };
  /** Open or close the pause menu; the match is frozen while it is open. */
  function setMenu(open: boolean) {
    if (!menu || menuOpen === (open && started)) return;
    menuOpen = open && started;
    menu.hidden = !menuOpen;
    helpToggle?.setAttribute('aria-expanded', String(menuOpen));
    clearInput();
    resetClock();
    if (menuOpen) resume?.focus({ preventScroll: true });
    else focusCanvas();
  }
  const onHelp = () => setMenu(!menuOpen);
  const onResume = () => setMenu(false);
  /** Back to the title, where the demo match starts again. */
  const onQuit = () => {
    setMenu(false);
    started = false;
    bot = undefined;
    intro.hidden = false;
    paused.hidden = true;
    restart();
  };
  const onHelpKey = (event: KeyboardEvent) => {
    if (
      (event.code === 'KeyH' || event.code === 'Escape') &&
      !event.repeat &&
      !event.ctrlKey &&
      !event.metaKey
    )
      setMenu(!menuOpen);
  };
  start.addEventListener('click', onStart);
  startSolo?.addEventListener('click', onStartSolo);
  again?.addEventListener('click', onReset);
  resume?.addEventListener('click', onResume);
  quit?.addEventListener('click', onQuit);
  coachHide?.addEventListener('click', stopCoaching);
  if (startSolo) startSolo.disabled = false;
  helpToggle.addEventListener('click', onHelp);
  window.addEventListener('keydown', onWheelKey);
  window.addEventListener('keyup', onWheelKey);
  wheel?.addEventListener('click', onWheelClick);
  chip?.addEventListener('click', onChip);
  window.addEventListener('keydown', onHelpKey);
  pass.addEventListener('click', onPass);
  nudge.addEventListener('click', onNudge);
  reset.addEventListener('click', onReset);
  camera.addEventListener('click', onCamera);
  view.addEventListener('click', onView);
  mute.addEventListener('click', onMute);
  music?.addEventListener('click', onMusic);
  if (music) music.disabled = false;
  window.addEventListener('keydown', onMuteKey);
  window.addEventListener('pointerdown', onFirstGesture, { once: true });
  window.addEventListener('keydown', onFirstGesture, { once: true });
  selectors.forEach((button) => button.addEventListener('click', onSelect));
  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointerup', onPointerUp);
  host.addEventListener('pointercancel', onPointerCancel);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  nudge.disabled = reset.disabled = camera.disabled = view.disabled = false;
  mute.disabled = pass.disabled = false;
  start.disabled = helpToggle.disabled = false;
  // The match has its own HUD; the playground keeps its debug controls.
  if (demoTag) demoTag.hidden = !demoBots.length;
  // The tuning panel is for free play and for anyone who asks with ?tune.
  document.body.classList.toggle(
    'show-tuning',
    !playing || new URLSearchParams(location.search).has('tune'),
  );
  modeTag.textContent = playing ? 'Match' : 'Weapon playground';
  reset.textContent = playing ? 'New match' : 'Reset scene';
  moveMeter.hidden = !playing || MATCH.moveSeconds <= 0;
  nudge.hidden = zaps.hidden = playing;
  score.hidden = lampBar.hidden = !playing;
  banner.hidden = true;
  settleWorld();
  selectWeapon(0);
  updateHUD(world.snapshot());
  frame = requestAnimationFrame(render);
  return () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    keyboard.destroy();
    tuning.destroy();
    gamepad.clear();
    pass.removeEventListener('click', onPass);
    start.removeEventListener('click', onStart);
    startSolo?.removeEventListener('click', onStartSolo);
    again?.removeEventListener('click', onReset);
    resume?.removeEventListener('click', onResume);
    quit?.removeEventListener('click', onQuit);
    coachHide?.removeEventListener('click', stopCoaching);
    if (menu) menu.hidden = true;
    if (countdown) countdown.hidden = true;
    if (splatcam) splatcam.hidden = true;
    if (coach) coach.hidden = true;
    helpToggle.removeEventListener('click', onHelp);
    window.removeEventListener('keydown', onWheelKey);
    window.removeEventListener('keyup', onWheelKey);
    wheel?.removeEventListener('click', onWheelClick);
    chip?.removeEventListener('click', onChip);
    weaponHelpItems.forEach((item) => item.remove());
    window.removeEventListener('keydown', onHelpKey);
    lampBar.replaceChildren();
    if (scoreboard) scoreboard.hidden = true;
    document.body.classList.remove('show-tuning');
    nudge.removeEventListener('click', onNudge);
    reset.removeEventListener('click', onReset);
    camera.removeEventListener('click', onCamera);
    view.removeEventListener('click', onView);
    mute.removeEventListener('click', onMute);
    music?.removeEventListener('click', onMusic);
    window.removeEventListener('keydown', onMuteKey);
    window.removeEventListener('pointerdown', onFirstGesture);
    window.removeEventListener('keydown', onFirstGesture);
    sfx.destroy();
    selectors.forEach((button) =>
      button.removeEventListener('click', onSelect),
    );
    host.removeEventListener('pointerdown', onPointerDown);
    host.removeEventListener('pointerup', onPointerUp);
    host.removeEventListener('pointercancel', onPointerCancel);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    weaponButtons.forEach((button) => button.remove());
    selectors.forEach((button) => button.remove());
    world.destroy();
    scene.destroy();
  };
}
