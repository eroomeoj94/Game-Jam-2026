import {
  AIM,
  ARENA,
  BOSH,
  DANCE,
  HAZARD,
  LAMPS,
  MATCH,
  MAX_FRAME_MS,
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
import { createGamepadInput } from './input/gamepad';
import { createPlayerInput } from './input/player';
import { createScene } from './view/scene';
import { createSfx } from './audio/sfx';
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
};

const teamLabel = (team: number) =>
  `${TEAM_LABELS[team]?.icon ?? '?'} ${TEAM_LABELS[team]?.name ?? `Team ${team + 1}`}`;
const NO_MOVEMENT = { x: 0, z: 0, jump: false, flutter: false };

export function startApplication({
  randomSpawns = true,
  mode = new URLSearchParams(location.search).has('playground')
    ? 'playground'
    : 'match',
  hands = true,
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
    playing ? createMatch(ARENA.spawns.map(({ team }) => team)) : undefined;
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
  const gamepad = createGamepadInput();
  const keyboard = createPlayerInput(
    selectMoth,
    toggleView,
    (step) => selectWeapon(weaponIndex + step),
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
  const weaponButtons = WEAPONS.map((weapon, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.weapon = weapon.id;
    button.textContent = weapon.name;
    button.addEventListener('click', () => {
      selectWeapon(index);
      focusCanvas();
    });
    weaponBar.appendChild(button);
    return button;
  });
  let weaponIndex = 0;
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
  // Nothing responds until Start is pressed on the title screen.
  let started = false;
  /** Seconds until the winning team's next round of dancing. */
  let partyTimer = 0;
  let wasRespawning = false;
  let pointerStart: { x: number; y: number; id: number } | undefined;

  function focusCanvas() {
    host?.querySelector('canvas')?.focus({ preventScroll: true });
  }
  function clearInput() {
    keyboard.clear();
    gamepad.clear();
    cancelAim();
  }
  function cancelAim() {
    aiming = false;
    power = 0;
    scene.setAim(undefined);
  }
  function selectWeapon(index: number) {
    weaponIndex = (index + WEAPONS.length) % WEAPONS.length;
    weaponButtons.forEach((button, i) =>
      button.setAttribute('aria-pressed', String(i === weaponIndex)),
    );
    power = 0;
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
      if (match && !match.beginAim()) return;
      aiming = true;
      power = 0;
    }
    if (!aiming) return;
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
    if (world.useWeapon(weapon.id, aim, weapon.charge ? power : 1))
      match?.fired(weapon.id, lamp);
    cancelAim();
  }
  /** End the turn without attacking: the moth dances instead. */
  function passTurn() {
    if (!started) return;
    if (match && !match.pass()) return;
    world.dance();
    cancelAim();
    focusCanvas();
  }
  function selectMoth(id: number) {
    if (!started) return;
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
  /** Say why it is silent: muted, or waiting for the browser to allow audio. */
  function updateSoundLabel() {
    if (!mute) return;
    const label = sfx.muted
      ? 'Sound off'
      : sfx.status === 'on'
        ? 'Sound on'
        : 'Sound: press any key';
    if (mute.textContent !== label) mute.textContent = label;
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
      if (event.type === 'zap') match.zapped(event.team);
    for (const moth of view.moths)
      if (moth.respawning && !match.isResting(moth.id)) match.mothOut(moth.id);
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
        scene.showScores(event.awards, world.snapshot());
        sfx.chime(event.awards.filter((team) => team !== undefined).length);
      } else if (event.type === 'won') {
        sfx.fanfare();
        partyTimer = 0;
      } else if (event.type === 'threat') {
        const view = world.snapshot();
        const spot =
          hands && MATCH.roundSmack && !view.hazards.length
            ? crowdedSpot(view, LAMPS.haloRadius)
            : undefined;
        if (spot) world.threaten(spot);
      } else if (event.type === 'turn') {
        if (event.moth !== undefined) world.selectMoth(event.moth);
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
  function turnMessage(state: MatchView, mothName: string) {
    const team = teamLabel(state.team);
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
      }`;
    if (state.phase === 'scored' && MATCH.scoring === 'incoming') {
      const banker = (state.team + 1) % TEAM_LABELS.length;
      const lamps = state.awards.filter((holder) => holder === banker).length;
      return `${teamLabel(banker)} ${
        lamps
          ? `banks ${lamps} lamp${lamps === 1 ? '' : 's'} · +${lamps}`
          : 'held no lamps'
      }`;
    }
    if (state.phase === 'scored')
      return `Round ${state.round} · ${tally(state.awards)}`;
    if (state.phase === 'won')
      return `${teamLabel(state.winner ?? 0)} wins ${state.scores.join(' – ')}`;
    return '';
  }
  function lampChip(lamp: LampControl) {
    if (lamp.zapper) return { state: 'zapper', mark: '⚡', text: 'bug zapper' };
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
      setText(chip, `${index + 1} ${mark}${swat ? ' ✋' : ''}`);
      if (chip.dataset.state !== chipState) chip.dataset.state = chipState;
      const title = `Lamp ${index + 1}: ${text}${swat ? ', hand overhead' : ''}`;
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
    pass.disabled = !['plan', 'move', 'settle', 'aim'].includes(state.phase);
    const message = bannerMessage(state);
    setText(banner, message);
    banner.hidden = message === '';
    if (banner.dataset.phase !== state.phase)
      banner.dataset.phase = state.phase;
    weaponButtons.forEach((button, index) => {
      if (WEAPONS[index]?.id !== 'zap') return;
      const left = state.zapSwitches[state.team] ?? 0;
      setText(button, `${WEAPONS[index].name} ×${left}`);
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
    const mothName = ARENA.spawns[active.id]?.name ?? 'Moth';
    const message = turn
      ? turnMessage(turn, mothName)
      : `${mothName} · ${state}`;
    if (status.textContent !== message) status.textContent = message;
    fuel.value = active.flutter;
    fuelText.textContent = `${Math.round(active.flutter * 100)}%`;
    selectors.forEach((button, id) => {
      button.setAttribute('aria-pressed', String(id === view.selectedMoth));
      button.disabled = turn
        ? turn.phase !== 'plan' ||
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
    paused.hidden = !started;
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
    if (!started) {
      // The start screen shows the desk but takes no game input.
      if (!document.hidden && !unfocused) {
        keyboard.clear();
        seconds += elapsed / 1000;
        scene.render(world.snapshot(), seconds);
      }
      frame = requestAnimationFrame(render);
      return;
    }
    if (!document.hidden && !unfocused) {
      const pad = gamepad.poll();
      if (controllerStatus && controllerStatus.textContent !== pad.text)
        controllerStatus.textContent = pad.text;
      if (pad.switchMoth) {
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
      if (pad.pass) passTurn();
      if (pad.toggleView) toggleView();
      if (pad.resetView) scene.resetCamera();
      scene.orbitCamera(pad.lookX, pad.lookY, elapsed / 1000);
      if (pad.weaponStep) selectWeapon(weaponIndex + pad.weaponStep);
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
        const command = {
          ...scene.movementDirection(movement.x, movement.z),
          jump,
          flutter: keys.flutter || controller.flutter,
        };
        accumulator -= PHYSICS_STEP_MS;
        if (!match) {
          world.step(command);
          continue;
        }
        // The first movement input locks in the moth and starts its allowance.
        if (movement.x || movement.z || jump) match.startMove();
        const turn = match.view();
        // The world is frozen while a player plans, aims or reads the score.
        if (turn.stepping)
          world.step(turn.phase === 'move' ? command : NO_MOVEMENT);
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
      const listener = scene.listenerPosition();
      sfx.playEvents(events, listener);
      sfx.update(view, listener);
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
  const onReset = () => {
    clearInput();
    world.destroy();
    world = newWorld();
    match = newMatch();
    settleWorld();
    resetClock();
    seconds = 0;
    wasRespawning = false;
    updateHUD(world.snapshot());
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
    sfx.setMuted(!sfx.muted);
    mute.setAttribute('aria-pressed', String(sfx.muted));
    updateSoundLabel();
    focusCanvas();
  };
  const onMuteKey = (event: KeyboardEvent) => {
    if (
      event.code === 'KeyM' &&
      !event.repeat &&
      !event.ctrlKey &&
      !event.metaKey
    )
      onMute();
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
  const onStart = () => {
    started = true;
    intro.hidden = true;
    sfx.unlock();
    clearInput();
    resetClock();
    focusCanvas();
  };
  const toggleHelp = () => {
    help.hidden = !help.hidden;
    helpToggle.setAttribute('aria-expanded', String(!help.hidden));
  };
  const onHelp = () => {
    toggleHelp();
    focusCanvas();
  };
  const onHelpKey = (event: KeyboardEvent) => {
    if (
      event.code === 'KeyH' &&
      !event.repeat &&
      !event.ctrlKey &&
      !event.metaKey
    )
      toggleHelp();
  };
  start.addEventListener('click', onStart);
  helpToggle.addEventListener('click', onHelp);
  window.addEventListener('keydown', onHelpKey);
  pass.addEventListener('click', onPass);
  nudge.addEventListener('click', onNudge);
  reset.addEventListener('click', onReset);
  camera.addEventListener('click', onCamera);
  view.addEventListener('click', onView);
  mute.addEventListener('click', onMute);
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
  modeTag.textContent = playing ? 'Match' : 'Weapon playground';
  reset.textContent = playing ? 'New match' : 'Reset scene';
  nudge.hidden = zaps.hidden = playing;
  score.hidden = lampBar.hidden = !playing;
  moveMeter.hidden = !playing || MATCH.moveSeconds <= 0;
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
    helpToggle.removeEventListener('click', onHelp);
    window.removeEventListener('keydown', onHelpKey);
    lampBar.replaceChildren();
    nudge.removeEventListener('click', onNudge);
    reset.removeEventListener('click', onReset);
    camera.removeEventListener('click', onCamera);
    view.removeEventListener('click', onView);
    mute.removeEventListener('click', onMute);
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
