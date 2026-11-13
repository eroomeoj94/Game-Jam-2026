// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import page from '../index.html?raw';
import { startApplication } from './application';
import { createScene } from './view/scene';
import { MAX_FRAME_MS } from './config';

// Only the GPU-facing scene is replaced. Controls, lifecycle, clock handling,
// and cannon-es simulation are the production code, using the real page markup.
vi.mock('./view/scene', () => ({
  createScene: vi.fn((host: HTMLElement) => {
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    return {
      render: vi.fn(),
      resetCamera: vi.fn(),
      destroy: vi.fn(() => canvas.remove()),
    };
  }),
}));

let pendingFrames: Map<number, FrameRequestCallback>;
let cleanups: Array<() => void>;
let nextFrameId: number;

function mount() {
  const cleanup = startApplication();
  cleanups.push(cleanup);
  const scene = vi.mocked(createScene).mock.results.at(-1)?.value;
  if (!scene) throw new Error('Application did not create a scene.');
  return { scene, cleanup, render: vi.mocked(scene.render) };
}

function frame(time: number) {
  const callbacks = [...pendingFrames.values()];
  pendingFrames.clear();
  callbacks.forEach((callback) => callback(time));
}

function click(id: string) {
  const button = document.getElementById(id);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing ${id}`);
  button.click();
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: hidden,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.innerHTML = page;
  pendingFrames = new Map();
  cleanups = [];
  nextFrameId = 0;
  setHidden(false);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pendingFrames.set(++nextFrameId, callback);
    return nextFrameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) =>
    pendingFrames.delete(id),
  );
});

afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.innerHTML = '';
});

describe('application smoke tests', () => {
  it('boots using the shipped HTML, enables controls, and runs one animation loop', () => {
    const { render } = mount();
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
    for (const button of document.querySelectorAll('button')) {
      expect(button.disabled).toBe(false);
    }
    for (let tick = 0; tick < 120; tick++) frame(tick * 20);
    expect(render).toHaveBeenCalledTimes(120);
    expect(pendingFrames.size).toBe(1);
    expect(render.mock.lastCall?.[0].moths).toHaveLength(2);
  });

  it('survives 100 nudge/reset cycles and restores the initial world every time', () => {
    const { render } = mount();
    frame(0);
    const initial = render.mock.lastCall?.[0];
    for (let cycle = 0; cycle < 100; cycle++) {
      const time = cycle * 1000;
      for (let clickCount = 0; clickCount < 10; clickCount++) click('nudge');
      for (let tick = 1; tick <= 10; tick++) frame(time + tick * 20);
      expect(render.mock.lastCall?.[0].lamp).not.toEqual(initial?.lamp);
      click('reset');
      frame(time + 500);
      expect(render.mock.lastCall?.[0]).toEqual(initial);
      expect(render.mock.lastCall?.[1]).toBe(0);
      expect(pendingFrames.size).toBe(1);
    }
    expect(createScene).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('caps a one-minute frame gap instead of catching up the entire minute', () => {
    const { render } = mount();
    frame(0);
    click('nudge');
    frame(60_000);
    const afterGap = render.mock.lastCall;
    expect(afterGap?.[1]).toBeCloseTo(MAX_FRAME_MS / 1000);
    expect(afterGap?.[0].lamp.x).toBeGreaterThan(0);
    click('reset');
    frame(60_001);
    click('nudge');
    frame(60_001 + MAX_FRAME_MS);
    expect(render.mock.lastCall).toEqual(afterGap);
  });

  it('pauses while hidden and resumes without a physics or animation jump', () => {
    const { render } = mount();
    frame(0);
    click('nudge');
    frame(20);
    const beforePause = render.mock.lastCall;
    const callsBeforePause = render.mock.calls.length;
    setHidden(true);
    frame(30_000);
    frame(60_000);
    expect(render).toHaveBeenCalledTimes(callsBeforePause);
    setHidden(false);
    frame(120_000);
    expect(render.mock.lastCall).toEqual(beforePause);
    frame(120_020);
    expect(render.mock.lastCall?.[0].lamp).not.toEqual(beforePause?.[0].lamp);
    expect(pendingFrames.size).toBe(1);
  });

  it('wires camera reset without restarting or changing the simulation', () => {
    const { scene, render } = mount();
    frame(0);
    click('nudge');
    frame(20);
    const beforeResetView = render.mock.lastCall;
    click('camera');
    expect(scene.resetCamera).toHaveBeenCalledOnce();
    expect(render.mock.lastCall).toEqual(beforeResetView);
    frame(40);
    expect(render.mock.lastCall?.[0].lamp.x).toBeGreaterThan(
      beforeResetView?.[0].lamp.x ?? 0,
    );
  });

  it('tears down and remounts without leaving duplicate loops or button handlers', () => {
    const first = mount();
    frame(0);
    const queuedCallback = [...pendingFrames.values()][0];
    first.cleanup();
    first.cleanup();
    expect(first.scene.destroy).toHaveBeenCalledOnce();
    expect(pendingFrames.size).toBe(0);
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
    queuedCallback?.(100);
    expect(first.render).toHaveBeenCalledOnce();
    expect(pendingFrames.size).toBe(0);
    const second = mount();
    click('camera');
    expect(first.scene.resetCamera).not.toHaveBeenCalled();
    expect(second.scene.resetCamera).toHaveBeenCalledOnce();
    frame(200);
    expect(second.render).toHaveBeenCalledOnce();
    expect(pendingFrames.size).toBe(1);
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('fails clearly on missing page controls before creating GPU resources or a loop', () => {
    document.getElementById('reset')?.remove();
    expect(startApplication).toThrow('Missing scene controls.');
    expect(createScene).not.toHaveBeenCalled();
    expect(pendingFrames.size).toBe(0);
  });
});
