// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import page from '../index.html?raw';
import { startApplication } from './application';
import { createScene } from './view/scene';
import { ARENA, MAX_FRAME_MS } from './config';
import type { GamepadState } from './input/gamepad';

// Only the GPU-facing scene is replaced. Controls, lifecycle, clock handling,
// and cannon-es simulation are the production code, using the real page markup.
vi.mock('./view/scene', () => ({
  createScene: vi.fn((host: HTMLElement) => {
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    return {
      render: vi.fn(),
      resetCamera: vi.fn(),
      toggleView: vi.fn(() => 'board'),
      aimDirection: vi.fn(() => ({ x: 1, y: 0.4, z: 0 })),
      setAim: vi.fn(),
      playEvents: vi.fn(),
      movementDirection: vi.fn((x: number, z: number) => ({ x, z })),
      orbitCamera: vi.fn(),
      pickMoth: vi.fn<() => number | undefined>(() => undefined),
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
    expect(render.mock.lastCall?.[0].moths).toHaveLength(ARENA.spawns.length);
  });

  it('survives 100 nudge/reset cycles and restores the initial world every time', () => {
    const { render } = mount();
    frame(0);
    const initial = render.mock.lastCall?.[0];
    for (let cycle = 0; cycle < 100; cycle++) {
      const time = cycle * 1000;
      for (let clickCount = 0; clickCount < 10; clickCount++) click('nudge');
      for (let tick = 1; tick <= 10; tick++) frame(time + tick * 20);
      expect(render.mock.lastCall?.[0].lamps).not.toEqual(initial?.lamps);
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
    expect(afterGap?.[0].lamps[0].x).toBeGreaterThan(0);
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
    expect(render.mock.lastCall?.[0].lamps).not.toEqual(beforePause?.[0].lamps);
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
    expect(render.mock.lastCall?.[0].lamps[0].x).toBeGreaterThan(
      beforeResetView?.[0].lamps[0].x ?? 0,
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

function key(code: string, type = 'keydown', repeat = false) {
  const event = new KeyboardEvent(type, {
    code,
    repeat,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
}
function frames(from: number, count: number) {
  for (let tick = 1; tick <= count; tick++) frame(from + tick * 20);
}

describe('weapon playground smoke tests', () => {
  it('cycles weapons with Q/E and fires on release of a held F', () => {
    const { scene, render } = mount();
    frames(0, 30);
    expect(
      document
        .querySelector('[data-weapon="gust"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    key('KeyE');
    key('KeyE', 'keyup');
    expect(
      document
        .querySelector('[data-weapon="bosh"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    key('KeyE');
    key('KeyE', 'keyup');
    key('KeyE');
    key('KeyE', 'keyup');
    expect(
      document
        .querySelector('[data-weapon="cap"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    key('KeyF');
    frames(600, 25);
    // Charging shows the preview and fills the power meter.
    expect(scene.setAim).toHaveBeenLastCalledWith(
      expect.objectContaining({ weapon: 'cap' }),
    );
    const power = Number(
      (document.querySelector('#charge') as HTMLProgressElement).value,
    );
    expect(power).toBeGreaterThan(0.2);
    expect(render.mock.lastCall![0].projectiles).toHaveLength(0);
    key('KeyF', 'keyup');
    frames(1200, 2);
    expect(scene.setAim).toHaveBeenLastCalledWith(undefined);
    expect(render.mock.lastCall![0].projectiles).toHaveLength(1);
    expect(scene.playEvents).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'launch' })]),
      expect.anything(),
    );
    expect(document.querySelector('#charge-value')?.textContent).toBe(
      'Reloading',
    );
  });
});

describe('movement control smoke tests', () => {
  it('selects with 1/2 and translates keyboard movement through the camera direction', () => {
    const { scene, render } = mount();
    frames(0, 30);
    key('Digit2');
    vi.mocked(scene.movementDirection).mockImplementation(
      (x: number, z: number) => ({
        x: z,
        z: -x,
      }),
    );
    const start = render.mock.lastCall![0];
    expect(key('KeyD').defaultPrevented).toBe(true);
    frames(600, 20);
    key('KeyD', 'keyup');
    const moved = render.mock.lastCall![0];
    expect(moved.selectedMoth).toBe(1);
    expect(moved.moths[1]!.z).toBeLessThan(start.moths[1]!.z - 0.4);
    expect(moved.moths[0]!.x).toBe(start.moths[0]!.x);
    expect(
      document.querySelector('#moth-1')?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(document.querySelector('#status')?.textContent).toContain('Mothhew');
  });

  it('jumps and flutters with Space, updates the meter, and clears held controls on reset', () => {
    const { render } = mount();
    frames(0, 30);
    key('Space');
    frames(600, 20);
    const airborne = render.mock.lastCall![0].moths[0]!;
    expect(airborne.y).toBeGreaterThan(1);
    expect(airborne.fluttering).toBe(true);
    expect(
      document.querySelector<HTMLProgressElement>('#flutter')!.value,
    ).toBeLessThan(1);
    click('reset');
    frames(1000, 50); // Space was never released: reset must still clear it.
    const reset = render.mock.lastCall![0].moths[0]!;
    expect(reset.grounded).toBe(true);
    expect(reset.flutter).toBe(1);
    expect(reset.fluttering).toBe(false);
  });

  it('clears movement after focus loss and ignores stale key repeats on return', () => {
    const { render } = mount();
    frames(0, 30);
    key('KeyD');
    frames(600, 15);
    window.dispatchEvent(new Event('blur'));
    const paused = render.mock.lastCall;
    frame(30_000);
    expect(render.mock.lastCall).toBe(paused);
    window.dispatchEvent(new Event('focus'));
    key('KeyD', 'keydown', true);
    frames(30_000, 30);
    const stopped = render.mock.lastCall![0].moths[0]!;
    frames(30_600, 30);
    expect(render.mock.lastCall![0].moths[0]!.x).toBeCloseTo(stopped.x, 3);
    key('KeyD', 'keyup');
    key('KeyD');
    frames(31_200, 20);
    expect(render.mock.lastCall![0].moths[0]!.x).toBeGreaterThan(
      stopped.x + 0.5,
    );
  });

  it('selects a clicked moth but does not treat a camera drag as a selection', () => {
    const { scene, render } = mount();
    const host = document.querySelector('#game')!;
    vi.mocked(scene.pickMoth).mockReturnValue(1);
    host.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        button: 0,
        clientX: 100,
        clientY: 100,
      }),
    );
    host.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: 1,
        button: 0,
        clientX: 101,
        clientY: 100,
      }),
    );
    frame(0);
    expect(render.mock.lastCall![0].selectedMoth).toBe(1);
    vi.mocked(scene.pickMoth).mockReturnValue(0);
    host.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 2,
        button: 0,
        clientX: 100,
        clientY: 100,
      }),
    );
    host.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: 2,
        button: 0,
        clientX: 150,
        clientY: 100,
      }),
    );
    frame(20);
    expect(render.mock.lastCall![0].selectedMoth).toBe(1);
    expect(scene.pickMoth).toHaveBeenCalledOnce();
  });

  it('drives real physics with standard controller input and stops on disconnect', () => {
    const makePad = (axes: number[], pressed: number[] = []): GamepadState => ({
      id: 'DualSense smoke test',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes,
      buttons: Array.from({ length: 17 }, (_, index) => ({
        pressed: pressed.includes(index),
        touched: pressed.includes(index),
        value: pressed.includes(index) ? 1 : 0,
      })),
    });
    let pads: (GamepadState | null)[] = [makePad([0, 0, 0, 0])];
    const original = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => pads,
    });
    try {
      const { scene, render } = mount();
      frames(0, 30);
      pads = [makePad([1, 0, 0.6, 0])];
      frames(600, 20);
      expect(render.mock.lastCall![0].moths[0]!.x).toBeGreaterThan(
        ARENA.spawns[0]!.x + 0.7,
      );
      expect(scene.orbitCamera).toHaveBeenLastCalledWith(
        expect.any(Number),
        0,
        0.02,
      );
      // Stop before hopping: a running hop at full speed carries the moth
      // across the desk onto the other moth.
      pads = [makePad([0, 0, 0, 0])];
      frames(1000, 10);
      pads = [makePad([0, 0, 0, 0], [0])];
      frames(1200, 15);
      expect(render.mock.lastCall![0].moths[0]!.y).toBeGreaterThan(1);
      pads = [null];
      frames(1500, 140);
      const landed = render.mock.lastCall![0].moths[0]!;
      expect(landed.grounded).toBe(true);
      expect(landed.fluttering).toBe(false);
      expect(
        document.querySelector('#controller-status')?.textContent,
      ).toContain('connect');
      pads = [makePad([0, 0, 0, 0])];
      frame(4320);
      pads = [makePad([0, 0, 0, 0], [5])];
      frame(4340);
      expect(render.mock.lastCall![0].selectedMoth).toBe(1);
      frames(4340, 10);
      expect(render.mock.lastCall![0].selectedMoth).toBe(1);
      pads = [makePad([0, 0, 0, 0])];
      frame(4560);
      pads = [makePad([0, 0, 0, 0], [3])];
      frame(4580);
      expect(scene.toggleView).toHaveBeenCalledOnce();
      pads = [makePad([0, 0, 0, 0])];
      frame(4600);
      pads = [makePad([0, 0, 0, 0], [11])];
      frame(4620);
      expect(scene.resetCamera).toHaveBeenCalledOnce();
    } finally {
      if (original) Object.defineProperty(navigator, 'getGamepads', original);
      else Reflect.deleteProperty(navigator, 'getGamepads');
    }
  });
});
