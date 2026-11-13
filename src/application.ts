import { MAX_FRAME_MS, PHYSICS_STEP_MS } from './config';
import { createWorld } from './game/world';
import { createScene } from './view/scene';

export function startApplication() {
  const host = document.querySelector<HTMLDivElement>('#game');
  const status = document.querySelector<HTMLParagraphElement>('#status');
  const nudge = document.querySelector<HTMLButtonElement>('#nudge');
  const reset = document.querySelector<HTMLButtonElement>('#reset');
  const camera = document.querySelector<HTMLButtonElement>('#camera');
  if (!host || !status || !nudge || !reset || !camera)
    throw new Error('Missing scene controls.');
  const scene = createScene(host);
  let world = createWorld();
  let accumulator = 0;
  let previousTime: number | undefined;
  let seconds = 0;
  let frame = 0;
  let disposed = false;
  const onVisibilityChange = () => {
    accumulator = 0;
    previousTime = undefined;
  };
  function render(time: number) {
    if (disposed) return;
    const elapsed =
      previousTime === undefined
        ? 0
        : Math.min(time - previousTime, MAX_FRAME_MS);
    previousTime = time;
    if (!document.hidden) {
      accumulator += elapsed;
      seconds += elapsed / 1000;
      while (accumulator >= PHYSICS_STEP_MS) {
        world.step();
        accumulator -= PHYSICS_STEP_MS;
      }
      scene.render(world.snapshot(), seconds);
    }
    frame = requestAnimationFrame(render);
  }
  const onNudge = () => {
    world.nudgeLamp();
    status.textContent = 'One light. Far too many feelings.';
  };
  const onReset = () => {
    world.destroy();
    world = createWorld();
    accumulator = 0;
    previousTime = undefined;
    seconds = 0;
    status.textContent = 'A small dispute of enormous importance.';
  };
  nudge.addEventListener('click', onNudge);
  reset.addEventListener('click', onReset);
  camera.addEventListener('click', scene.resetCamera);
  document.addEventListener('visibilitychange', onVisibilityChange);
  nudge.disabled = reset.disabled = camera.disabled = false;
  status.textContent = 'A small dispute of enormous importance.';
  frame = requestAnimationFrame(render);
  return () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    nudge.removeEventListener('click', onNudge);
    reset.removeEventListener('click', onReset);
    camera.removeEventListener('click', scene.resetCamera);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    world.destroy();
    scene.destroy();
  };
}
