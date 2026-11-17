import {
  AIM,
  ARENA,
  MAX_FRAME_MS,
  PHYSICS_STEP_MS,
  WEAPONS,
  ZAP,
} from './config';
import { createWorld } from './game/world';
import type { WorldView } from './game/world';
import { createGamepadInput } from './input/gamepad';
import { createPlayerInput } from './input/player';
import { createScene } from './view/scene';
import { createSfx } from './audio/sfx';
import { createTuningPanel, loadSavedTuning } from './ui/tuning';

export function startApplication() {
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
    !mothBar
  )
    throw new Error('Missing scene controls.');
  loadSavedTuning();
  const scene = createScene(host);
  const sfx = createSfx();
  let world = createWorld();
  const gamepad = createGamepadInput();
  const keyboard = createPlayerInput(selectMoth, toggleView, (step) =>
    selectWeapon(weaponIndex + step),
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
    const ready = !!active && !active.respawning && !active.zapped;
    if (!weapon || !ready) {
      if (aiming) cancelAim();
      return;
    }
    if (fireHeld && !aiming && view.weaponCooldown === 0) {
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
    world.useWeapon(weapon.id, aim, weapon.charge ? power : 1);
    cancelAim();
  }
  function selectMoth(id: number) {
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
  function updateHUD(view: WorldView) {
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
    const message = `${ARENA.spawns[active.id]?.name} · ${state}`;
    if (status.textContent !== message) status.textContent = message;
    fuel.value = active.flutter;
    fuelText.textContent = `${Math.round(active.flutter * 100)}%`;
    selectors.forEach((button, id) => {
      button.setAttribute('aria-pressed', String(id === view.selectedMoth));
      button.disabled = view.moths[id]?.respawning ?? true;
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
    resetClock();
    clearInput();
  };
  const onFocus = () => {
    unfocused = false;
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
    if (!document.hidden && !unfocused) {
      const pad = gamepad.poll();
      if (controllerStatus && controllerStatus.textContent !== pad.text)
        controllerStatus.textContent = pad.text;
      if (pad.switchMoth) {
        const current = world.snapshot().selectedMoth;
        selectMoth(
          (current + pad.switchMoth + ARENA.spawns.length) %
            ARENA.spawns.length,
        );
      }
      if (pad.toggleView) toggleView();
      if (pad.resetView) scene.resetCamera();
      scene.orbitCamera(pad.lookX, pad.lookY, elapsed / 1000);
      if (pad.weaponStep) selectWeapon(weaponIndex + pad.weaponStep);
      updateWeapon(keyboard.fireHeld() || pad.fire, elapsed / 1000);
      seconds += elapsed / 1000;
      // A zap freezes the action for a beat before the moth flies off.
      if (hitstop > 0) hitstop = Math.max(0, hitstop - elapsed / 1000);
      else accumulator += elapsed;
      while (accumulator >= PHYSICS_STEP_MS) {
        const keys = keyboard.read();
        const controller = gamepad.read();
        const movement = controller.x || controller.z ? controller : keys;
        const direction = scene.movementDirection(movement.x, movement.z);
        world.step({
          ...direction,
          jump: keys.jump || controller.jump,
          flutter: keys.flutter || controller.flutter,
        });
        accumulator -= PHYSICS_STEP_MS;
      }
      const view = world.snapshot();
      const events = world.drainEvents();
      if (events.some((event) => event.type === 'zap')) {
        hitstop = ZAP.hitstop;
        accumulator = 0;
      }
      for (const event of events)
        if (event.type === 'bosh') sfx.bosh(event.moth !== undefined);
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
    world = createWorld();
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
    sfx.setMuted(!sfx.muted);
    mute.setAttribute('aria-pressed', String(sfx.muted));
    mute.textContent = sfx.muted ? 'Sound off' : 'Sound on';
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
  });
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
  mute.disabled = false;
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
