import { ARENA, MAX_FRAME_MS, PHYSICS_STEP_MS } from './config';
import { createWorld } from './game/world';
import type { WorldView } from './game/world';
import { createGamepadInput } from './input/gamepad';
import { createPlayerInput } from './input/player';
import { createScene } from './view/scene';

export function startApplication() {
  const host = document.querySelector<HTMLDivElement>('#game');
  const status = document.querySelector<HTMLParagraphElement>('#status');
  const nudge = document.querySelector<HTMLButtonElement>('#nudge');
  const reset = document.querySelector<HTMLButtonElement>('#reset');
  const camera = document.querySelector<HTMLButtonElement>('#camera');
  const fuel = document.querySelector<HTMLProgressElement>('#flutter');
  const fuelText = document.querySelector<HTMLElement>('#flutter-value');
  const controllerStatus =
    document.querySelector<HTMLElement>('#controller-status');
  const selectors = [
    ...document.querySelectorAll<HTMLButtonElement>('[data-moth]'),
  ];
  if (
    !host ||
    !status ||
    !nudge ||
    !reset ||
    !camera ||
    !fuel ||
    !fuelText ||
    !controllerStatus ||
    selectors.length !== ARENA.spawns.length
  )
    throw new Error('Missing scene controls.');
  const scene = createScene(host);
  let world = createWorld();
  const gamepad = createGamepadInput();
  const keyboard = createPlayerInput(selectMoth);
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
  }
  function selectMoth(id: number) {
    if (!world.selectMoth(id)) return;
    clearInput();
    wasRespawning = false;
    updateHUD(world.snapshot());
    focusCanvas();
  }
  function updateHUD(view: WorldView) {
    const active = view.moths[view.selectedMoth];
    if (!active || !status || !fuel || !fuelText) return;
    const state = active.respawning
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
      if (pad.resetView) scene.resetCamera();
      scene.orbitCamera(pad.lookX, pad.lookY, elapsed / 1000);
      accumulator += elapsed;
      seconds += elapsed / 1000;
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
  const onSelect = (event: Event) => {
    if (event.currentTarget instanceof HTMLButtonElement)
      selectMoth(Number(event.currentTarget.dataset.moth));
  };
  nudge.addEventListener('click', onNudge);
  reset.addEventListener('click', onReset);
  camera.addEventListener('click', onCamera);
  selectors.forEach((button) => button.addEventListener('click', onSelect));
  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointerup', onPointerUp);
  host.addEventListener('pointercancel', onPointerCancel);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  nudge.disabled = reset.disabled = camera.disabled = false;
  updateHUD(world.snapshot());
  frame = requestAnimationFrame(render);
  return () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    keyboard.destroy();
    gamepad.clear();
    nudge.removeEventListener('click', onNudge);
    reset.removeEventListener('click', onReset);
    camera.removeEventListener('click', onCamera);
    selectors.forEach((button) =>
      button.removeEventListener('click', onSelect),
    );
    host.removeEventListener('pointerdown', onPointerDown);
    host.removeEventListener('pointerup', onPointerUp);
    host.removeEventListener('pointercancel', onPointerCancel);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    world.destroy();
    scene.destroy();
  };
}
