// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import page from '../index.html?raw';
import { startApplication } from './application';
import { createScene } from './view/scene';
import { ARENA, MATCH, MAX_FRAME_MS } from './config';
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
      showScores: vi.fn(),
      setSpotlight: vi.fn(),
      setFlyby: vi.fn(),
      listenerPosition: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
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

function mount(mode: 'match' | 'playground' = 'playground', hands = false) {
  // Fixed spawn slots keep these tests repeatable.
  // No loading screen: these tests start a match and play straight away.
  const cleanup = startApplication({
    randomSpawns: false,
    mode,
    hands,
    loadingSeconds: [0, 0],
    opening: false,
  });
  cleanups.push(cleanup);
  const scene = vi.mocked(createScene).mock.results.at(-1)?.value;
  if (!scene) throw new Error('Application did not create a scene.');
  // Past the title screen, which takes no game input.
  document.querySelector<HTMLButtonElement>('#start')?.click();
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
  // These walk-throughs were written for round scoring, which has one score
  // banner per round; incoming scoring is covered in the match rule tests.
  MATCH.scoring = 'round';
  MATCH.burnOut = false;
  MATCH.hotLamp = false;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pendingFrames.set(++nextFrameId, callback);
    return nextFrameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) =>
    pendingFrames.delete(id),
  );
});

const defaultScoring = MATCH.scoring;
afterEach(() => {
  MATCH.scoring = defaultScoring;
  MATCH.burnOut = true;
  MATCH.hotLamp = true;
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
    // The giants wander at random, so compare the clock and the lamps only.
    expect(render.mock.lastCall?.[1]).toEqual(afterGap?.[1]);
    expect(render.mock.lastCall?.[0].lamps).toEqual(afterGap?.[0].lamps);
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
      // L2 holds the weapon wheel open and the left stick points at Bosh.
      pads = [makePad([0, 0, 0, 0])];
      frame(4640);
      const wheel = document.querySelector<HTMLElement>('#wheel')!;
      const before = render.mock.lastCall![0].moths[1]!.x;
      // Bosh is the second of six round the wheel: up and to the right.
      pads = [makePad([0.866, -0.5, 0, 0], [6])];
      frames(4660, 10);
      expect(wheel.hidden).toBe(false);
      expect(
        document
          .querySelector('[data-weapon="bosh"]')
          ?.getAttribute('aria-pressed'),
      ).toBe('true');
      // The stick chose a weapon; it did not walk the moth.
      expect(render.mock.lastCall![0].moths[1]!.x).toBeCloseTo(before, 1);
      pads = [makePad([0, 0, 0, 0])];
      frame(4880);
      expect(wheel.hidden).toBe(true);
      expect(
        document
          .querySelector('[data-weapon="bosh"]')
          ?.getAttribute('aria-pressed'),
      ).toBe('true');
      // Options opens the pause menu, which the pad can then work.
      const menu = document.querySelector<HTMLElement>('#menu')!;
      pads = [makePad([0, 0, 0, 0])];
      frame(4900);
      pads = [makePad([0, 0, 0, 0], [9])];
      frame(4920);
      expect(menu.hidden).toBe(false);
      expect(document.activeElement?.id).toBe('resume');
      pads = [makePad([0, 0, 0, 0])];
      frame(4940);
      // D-pad down moves to the next button, and holding it moves only once.
      pads = [makePad([0, 0, 0, 0], [13])];
      frames(4960, 5);
      const second = document.activeElement as HTMLElement;
      expect(second.id).not.toBe('resume');
      expect(second.closest('.menu-buttons')).not.toBeNull();
      // The left stick steps back up to Resume, and Cross presses it.
      pads = [makePad([0, 0, 0, 0])];
      frame(5080);
      pads = [makePad([0, -1, 0, 0])];
      frames(5100, 5);
      expect(document.activeElement?.id).toBe('resume');
      pads = [makePad([0, 0, 0, 0])];
      frame(5220);
      pads = [makePad([0, 0, 0, 0], [0])];
      frame(5240);
      expect(menu.hidden).toBe(true);
      // Pressing Cross in the menu did not hop the moth afterwards.
      pads = [makePad([0, 0, 0, 0])];
      frames(5260, 10);
      // And Circle shuts an open menu too.
      pads = [makePad([0, 0, 0, 0], [9])];
      frame(5480);
      expect(menu.hidden).toBe(false);
      pads = [makePad([0, 0, 0, 0])];
      frame(5500);
      pads = [makePad([0, 0, 0, 0], [1])];
      frame(5520);
      expect(menu.hidden).toBe(true);
    } finally {
      if (original) Object.defineProperty(navigator, 'getGamepads', original);
      else Reflect.deleteProperty(navigator, 'getGamepads');
    }
  });
});

describe('match smoke tests', () => {
  const text = (selector: string) =>
    document.querySelector(selector)?.textContent ?? '';

  it('plays a round: frozen planning, a timed move, one action, handover and scoring', () => {
    const { scene, render } = mount('match');
    frames(0, 10);
    expect(text('#mode')).toBe('Match');
    expect(text('#score')).toContain('Mustard 0');
    expect(text('#status')).toContain('Mustard');
    expect(text('#status')).toContain('Dusty');
    expect(text('#banner')).toContain("Mustard's turn");
    expect(document.querySelectorAll('#lamps span')).toHaveLength(6);
    expect(document.querySelector('#nudge')).toHaveProperty('hidden', true);
    // The other team's moth cannot be picked, by key or by button.
    key('Digit2');
    expect(render.mock.lastCall![0].selectedMoth).toBe(0);
    expect(document.querySelector('#moth-1')).toHaveProperty('disabled', true);
    expect(document.querySelector('#moth-2')).toHaveProperty('disabled', false);
    // Nothing moves while the player plans.
    const planned = render.mock.lastCall![0].moths[0]!;
    frames(200, 20);
    expect(render.mock.lastCall![0].moths[0]).toEqual(planned);

    key('KeyD');
    frames(600, 25);
    key('KeyD', 'keyup');
    const moved = render.mock.lastCall![0].moths[0]!;
    expect(moved.x).toBeGreaterThan(planned.x + 1);
    // No move limit by default, so there is no meter to watch.
    expect(document.querySelector('#move-meter')).toHaveProperty(
      'hidden',
      true,
    );
    expect(document.querySelector('#moth-2')).toHaveProperty('disabled', true);

    // Holding fire freezes the world; releasing takes the turn's one action.
    key('KeyF');
    frames(1200, 5);
    const frozen = render.mock.lastCall![0].moths[0]!;
    key('KeyD');
    frames(1400, 20);
    key('KeyD', 'keyup');
    expect(render.mock.lastCall![0].moths[0]).toEqual(frozen);
    key('KeyF', 'keyup');
    frames(1900, 2);
    expect(scene.playEvents).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'gust' })]),
      expect.anything(),
    );
    expect(text('#status')).toContain('resolving');
    expect(document.querySelector('#pass')).toHaveProperty('disabled', true);
    // A second shot in the same turn does nothing.
    vi.mocked(scene.playEvents).mockClear();
    key('KeyF');
    frames(2000, 3);
    key('KeyF', 'keyup');
    frames(2100, 3);
    expect(scene.playEvents).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'gust' })]),
      expect.anything(),
    );

    // The same team's next moth goes; the one that acted is finished.
    frames(2200, 140);
    expect(text('#status')).toContain('Mustard');
    expect(text('#status')).toContain('Big Flap');
    expect(text('#banner')).toContain('3 moths to go');
    expect(render.mock.lastCall![0].selectedMoth).toBe(2);
    expect(document.querySelector('#moth-0')).toHaveProperty('disabled', true);
    key('Digit1');
    expect(render.mock.lastCall![0].selectedMoth).toBe(2);

    // Ending a go without attacking is a dance.
    let now = 5200;
    const danceGo = () => {
      key('KeyP');
      key('KeyP', 'keyup');
      frames(now, 140);
      now += 3000;
    };
    vi.mocked(scene.playEvents).mockClear();
    key('KeyP');
    key('KeyP', 'keyup');
    frames(now, 5);
    expect(scene.playEvents).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: 'dance', moth: 2 }),
      ]),
      expect.anything(),
    );
    expect(render.mock.lastCall![0].moths[2]!.dance).toBeGreaterThan(0);
    frames(now + 100, 140);
    now += 3000;
    danceGo();
    danceGo();
    // Every Mustard moth has had its go: over to Teal.
    expect(text('#status')).toContain('Teal');
    expect(text('#status')).toContain('Mothhew');
    expect(render.mock.lastCall![0].selectedMoth).toBe(1);
    for (let go = 0; go < 4; go++) danceGo();
    expect(text('#banner')).toContain('Round 1');
    expect(text('#score')).toContain('Round 1');
    frames(now, 170);
    // Teams keep the same order every round.
    expect(text('#score')).toContain('Round 2');
    expect(text('#banner')).toContain("Mustard's turn");
  });

  it('plays a demo match behind the start screen and deals a fresh one on Start', () => {
    const cleanup = startApplication({
      loadingSeconds: [0, 0],
      opening: false,
      randomSpawns: false,
      mode: 'match',
      hands: false,
    });
    cleanups.push(cleanup);
    const scene = vi.mocked(createScene).mock.results.at(-1)?.value;
    const render = vi.mocked(scene.render);
    frame(0);
    const dealt = render.mock.lastCall![0].moths.map(
      ({ x, z }: { x: number; z: number }) => ({ x, z }),
    );
    let now = 0;
    for (let tick = 0; tick < 400; tick++) frame((now += 20));
    const moved = render.mock.lastCall![0].moths.some(
      (moth: { x: number; z: number }, id: number) =>
        Math.hypot(moth.x - dealt[id].x, moth.z - dealt[id].z) > 1,
    );
    // The computers are walking their moths about, silently and unannounced.
    expect(moved).toBe(true);
    expect(document.querySelector<HTMLElement>('#banner')?.hidden).toBe(true);
    click('start');
    frame((now += 20));
    expect(text('#score')).toContain('Round 1');
    expect(text('#status')).toContain('Mustard');
    expect(text('#status')).toContain('pick a moth');
    const fresh = render.mock.lastCall![0].moths;
    dealt.forEach((spot: { x: number; z: number }, id: number) =>
      expect(
        Math.hypot(fresh[id].x - spot.x, fresh[id].z - spot.z),
      ).toBeLessThan(0.5),
    );
  });

  it('freezes the match behind the pause menu and can quit to the title', () => {
    const { render } = mount('match');
    frame(0);
    frame(20);
    const menu = document.querySelector<HTMLElement>('#menu')!;
    expect(menu.hidden).toBe(true);
    // First-match tips show until they are hidden.
    expect(text('#coach-text')).toContain('ring of light');
    click('coach-hide');
    frame(40);
    expect(document.querySelector<HTMLElement>('#coach')?.hidden).toBe(true);
    key('Escape');
    key('Escape', 'keyup');
    expect(menu.hidden).toBe(false);
    const calls = render.mock.calls.length;
    frame(60);
    frame(80);
    expect(render.mock.calls.length).toBe(calls);
    click('resume');
    expect(menu.hidden).toBe(true);
    frame(100);
    expect(render.mock.calls.length).toBeGreaterThan(calls);
    click('help-toggle');
    expect(menu.hidden).toBe(false);
    click('quit');
    expect(menu.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('#intro')?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('#scoreboard')?.hidden).toBe(
      true,
    );
  });

  it('lets the computer play Teal unaided in a one-player match', () => {
    const cleanup = startApplication({
      loadingSeconds: [0, 0],
      opening: false,
      randomSpawns: false,
      mode: 'match',
      hands: false,
    });
    cleanups.push(cleanup);
    click('humans-1');
    click('start');
    let now = 0;
    frame(now);
    // Mustard dances with each moth in turn to hand over.
    for (let tick = 0; tick < 3000; tick++) {
      if (text('#status').includes('computer')) break;
      if (text('#status').includes('pick a moth')) {
        key('KeyP');
        key('KeyP', 'keyup');
      }
      frame((now += 20));
    }
    expect(text('#status')).toContain('Teal');
    expect(text('#status')).toContain('the computer is playing');
    // The player cannot act for the computer.
    key('KeyP');
    key('KeyP', 'keyup');
    frame((now += 20));
    expect(text('#status')).toContain('the computer is playing');
    expect(document.querySelector<HTMLButtonElement>('#pass')?.disabled).toBe(
      true,
    );
    for (let tick = 0; tick < 8000; tick++) {
      if (
        text('#score').includes('Round 2') &&
        text('#status').includes('pick a moth')
      )
        break;
      frame((now += 20));
    }
    expect(text('#score')).toContain('Round 2');
    expect(text('#status')).toContain('Mustard');
    expect(text('#status')).toContain('pick a moth');
  }, 60_000);

  it('hangs a hand where a firecracker went off and drops it before scoring', () => {
    const { scene, render } = mount('match', true);
    frames(0, 10);
    // Nobody starts in a lamp's light, so the round opens with no hand.
    expect(render.mock.lastCall![0].hazards).toEqual([]);
    for (let step = 0; step < 4; step++) {
      key('KeyE');
      key('KeyE', 'keyup');
    }
    key('KeyF');
    frames(200, 3);
    key('KeyF', 'keyup');
    frames(300, 200);
    const played = () =>
      vi
        .mocked(scene.playEvents)
        .mock.calls.flatMap((call: unknown[]) =>
          (call[0] as { type: string }[]).map(({ type }) => type),
        );
    expect(played()).toEqual(expect.arrayContaining(['explode', 'heard']));
    // The bang drew a hand, and it waits there while the round plays on.
    expect(render.mock.lastCall![0].hazards[0]).toMatchObject({ held: true });
    expect(text('#status')).not.toContain('hand');
    let now = 5000;
    let sawHand = false;
    for (let go = 0; go < 12 && !text('#banner').includes('Round 1'); go++) {
      key('KeyP');
      key('KeyP', 'keyup');
      for (let tick = 0; tick < 300; tick++) {
        frame((now += 20));
        sawHand ||= text('#status').includes('here comes the hand');
        // The go is over once the next moth is up or the round is scored.
        if (
          tick > 5 &&
          (text('#status').includes('pick a moth') ||
            text('#banner').includes('Round 1'))
        )
          break;
      }
      if (!sawHand)
        expect(render.mock.lastCall![0].hazards[0]).toMatchObject({
          held: true,
        });
    }
    // It fell once everyone had played, and only then was the round scored.
    expect(sawHand).toBe(true);
    expect(played()).toContain('smack');
    expect(text('#banner')).toContain('Round 1');
    expect(render.mock.lastCall![0].hazards).toEqual([]);
    // A whole round of real physics: allow for a slow machine.
  }, 20_000);

  it('spends a timed movement allowance, then waits for an action or a pass', () => {
    MATCH.moveSeconds = 6;
    const { render } = mount('match');
    frames(0, 10);
    key('KeyD');
    frames(200, 330);
    const stopped = render.mock.lastCall![0].moths[0]!;
    expect(text('#move-value')).toBe('Spent');
    frames(7000, 30);
    expect(render.mock.lastCall![0].moths[0]!.x).toBe(stopped.x);
    expect(text('#status')).toContain('Mustard');
    key('KeyD', 'keyup');
    click('pass');
    frames(7800, 140);
    expect(text('#status')).toContain('Big Flap');
    MATCH.moveSeconds = 0;
  });

  it('starts a fresh match from New match', () => {
    const { render } = mount('match');
    frames(0, 10);
    key('KeyP');
    frames(200, 190);
    expect(text('#status')).toContain('Big Flap');
    expect(text('#reset')).toBe('New match');
    click('reset');
    frames(4000, 5);
    expect(text('#status')).toContain('Mustard');
    expect(text('#score')).toContain('Round 1');
    expect(render.mock.lastCall![0].selectedMoth).toBe(0);
  });
});

describe('the loading screen', () => {
  afterEach(() => vi.useRealTimers());

  it('holds the match back for its few seconds, showing moth facts', () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'],
    });
    // Shortest and longest the same, so the wait is known.
    const cleanup = startApplication({
      randomSpawns: false,
      mode: 'match',
      loadingSeconds: [8, 8],
    });
    cleanups.push(cleanup);
    const loader = document.querySelector<HTMLElement>('#loader')!;
    const intro = document.querySelector<HTMLElement>('#intro')!;
    const fact = () => document.querySelector('#loader-fact')!.textContent;
    expect(loader.hidden).toBe(true);
    document.querySelector<HTMLButtonElement>('#start')!.click();
    expect(loader.hidden).toBe(false);
    // The title is still behind it: the match has not begun.
    expect(intro.hidden).toBe(false);
    const first = fact();
    expect(first).toMatch(/moth/i);
    expect(
      document.querySelector<HTMLVideoElement>('#loader-video')!.src,
    ).toMatch(/media\/loading-[0-2]\.mp4$/);
    // When a film ends the next one takes over, round all three.
    const video = document.querySelector<HTMLVideoElement>('#loader-video')!;
    const films = new Set([video.src]);
    video.dispatchEvent(new Event('ended'));
    films.add(video.src);
    video.dispatchEvent(new Event('ended'));
    films.add(video.src);
    expect(films.size).toBe(3);
    // A second press while it loads changes nothing.
    document.querySelector<HTMLButtonElement>('#start')!.click();
    vi.advanceTimersByTime(5100);
    expect(fact()).not.toBe(first);
    vi.advanceTimersByTime(2700);
    expect(loader.hidden).toBe(false);
    vi.advanceTimersByTime(300);
    expect(loader.hidden).toBe(true);
    expect(intro.hidden).toBe(true);
  });
});

describe('the call before a match', () => {
  it('says ready, flutter, fight as the camera sweeps, then plays', () => {
    const cleanup = startApplication({
      randomSpawns: false,
      mode: 'match',
      loadingSeconds: [0, 0],
    });
    cleanups.push(cleanup);
    const scene = vi.mocked(createScene).mock.results.at(-1)!.value;
    const flyby = vi.mocked(scene.setFlyby);
    const word = () => {
      const shown = document.querySelector<HTMLElement>('#countdown')!;
      return shown.hidden ? '' : shown.textContent;
    };
    document.querySelector<HTMLButtonElement>('#start')!.click();
    expect(flyby).toHaveBeenLastCalledWith(0);
    const heard: string[] = [];
    let time = 0;
    // Seven seconds of frames, a twentieth of a second apart.
    for (let n = 0; n < 140; n++) {
      frame((time += 50));
      if (word() && heard.at(-1) !== word()) heard.push(word()!);
      // Keys do nothing while the call is made.
      if (n === 20)
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    }
    expect(heard).toEqual(['Ready?', 'Flutter!', 'Fight!']);
    // The sweep ran from start to finish and the camera was handed back.
    const sweeps: Array<number | undefined> = flyby.mock.calls.map(
      (call: unknown[]) => call[0] as number | undefined,
    );
    expect(sweeps.at(-1)).toBeUndefined();
    expect(Math.max(...sweeps.map((sweep) => sweep ?? 0))).toBeGreaterThan(
      0.95,
    );
    expect(word()).toBe('');
  });
});

describe('winning', () => {
  it('dances twice, then shows a scorecard with a way to play again', () => {
    const saved = {
      target: MATCH.targetScore,
      banner: MATCH.bannerSeconds,
      start: MATCH.headStart,
    };
    // Teal starts on the winning score, so the first bank ends the match.
    MATCH.targetScore = 1;
    MATCH.headStart = 1;
    MATCH.bannerSeconds = 0.1;
    try {
      const { render } = mount('match');
      const card = document.querySelector<HTMLElement>('#scorecard')!;
      const won = () =>
        /wins/.test(document.querySelector('#banner')!.textContent ?? '');
      let now = 0;
      // Mustard's moths dance their goes away, and the turn ends.
      for (let step = 0; step < 4000 && !won(); step++) {
        if (step % 30 === 0) {
          key('KeyP');
          key('KeyP', 'keyup');
        }
        frame((now += 20));
      }
      expect(won()).toBe(true);
      expect(card.hidden).toBe(true);
      let dances = 0;
      let dancing = false;
      for (let step = 0; step < 1500 && card.hidden; step++) {
        frame((now += 20));
        const busy = render.mock.lastCall![0].moths.some(
          (moth: { dance: number }) => moth.dance > 0,
        );
        if (busy && !dancing) dances += 1;
        dancing = busy;
      }
      expect(card.hidden).toBe(false);
      expect(dances).toBe(2);
      expect(document.querySelector('#scorecard-title')!.textContent).toMatch(
        /wins/,
      );
      expect(document.querySelectorAll('#scorecard-rows tr').length).toBe(7);
      // Nobody is still dancing behind the card a while later.
      for (let step = 0; step < 300; step++) frame((now += 20));
      expect(
        render.mock.lastCall![0].moths.some(
          (moth: { dance: number }) => moth.dance > 0,
        ),
      ).toBe(false);
      document.querySelector<HTMLButtonElement>('#again')!.click();
      expect(card.hidden).toBe(true);
    } finally {
      MATCH.targetScore = saved.target;
      MATCH.bannerSeconds = saved.banner;
      MATCH.headStart = saved.start;
    }
  });
});

describe('mind control', () => {
  it('takes control on a tap, and slams only on a second press', () => {
    const { render } = mount();
    frames(0, 30);
    // Q steps back from the first weapon to the last: Mind Control.
    key('KeyQ');
    key('KeyQ', 'keyup');
    expect(
      document
        .querySelector('[data-weapon="mind"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    const hint = document.querySelector<HTMLElement>('#aim-hint')!;
    key('KeyF');
    frames(600, 5);
    key('KeyF', 'keyup');
    frames(700, 30);
    // Letting go does not fire: the moth is still in control of a giant.
    expect(hint.hidden).toBe(false);
    expect(render.mock.lastCall![0].hazards).toHaveLength(0);
    const first = document.querySelector('#aim-giant')!.textContent;
    key('KeyE');
    key('KeyE', 'keyup');
    frames(1300, 3);
    expect(document.querySelector('#aim-giant')!.textContent).not.toBe(first);
    // The second press gives the order: one giant hand, already falling.
    key('KeyF');
    frames(1400, 5);
    key('KeyF', 'keyup');
    expect(hint.hidden).toBe(true);
    expect(render.mock.lastCall![0].hazards[0]).toMatchObject({ held: false });
  });
});

describe('ending a go hands over to the next moth', () => {
  const text = (selector: string) =>
    document.querySelector(selector)?.textContent ?? '';
  const selected = () =>
    [...document.querySelectorAll('#moths button')]
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => Number((button as HTMLElement).dataset.moth));
  /** Run frames until `done`, and say how many it took. */
  function until(done: () => boolean, from: number, limit = 600) {
    let now = from;
    for (let count = 0; count < limit; count++) {
      if (done()) return { frames: count, now };
      frame((now += 20));
    }
    return { frames: limit, now };
  }

  // The game as shipped: random starts, the hand, incoming scoring, the hot
  // lamp and burn-out, with and without the computer.
  for (const solo of [false, true])
    it(`switches moth after every go with the default rules (${solo ? 'one player' : 'two players'})`, () => {
      MATCH.scoring = 'incoming';
      MATCH.burnOut = true;
      MATCH.hotLamp = true;
      const cleanup = startApplication({
        mode: 'match',
        loadingSeconds: [0, 0],
        opening: false,
      });
      cleanups.push(cleanup);
      const scene = vi.mocked(createScene).mock.results.at(-1)?.value;
      const render = vi.mocked(scene.render);
      if (solo) click('humans-1');
      click('start');
      let now = 0;
      frame(now);
      const mustard = [0, 2, 4, 6];
      const seen: number[] = [];
      for (let go = 0; go < 4; go++) {
        expect(text('#status')).toContain('pick a moth');
        const moth = render.mock.lastCall![0].selectedMoth;
        // The moth in the status line, the panel and the world all agree.
        expect(mustard).toContain(moth);
        expect(selected()).toEqual([moth]);
        expect(text('#status')).toContain(ARENA.spawns[moth]!.name);
        expect(seen).not.toContain(moth);
        seen.push(moth);
        key('KeyP');
        key('KeyP', 'keyup');
        frame((now += 20));
        expect(text('#status')).toContain('resolving');
        // The next moth is up as soon as the dance is over. After the team's
        // last go the score banner shows first, so that handover is slower.
        const next = until(
          () =>
            !text('#status').includes('resolving') &&
            render.mock.lastCall![0].selectedMoth !== moth,
          now,
        );
        now = next.now;
        expect(next.frames).toBeLessThan(go < 3 ? 200 : 400);
      }
      expect(seen.sort()).toEqual(mustard);
      // Teal is up, with one of its own moths selected.
      const teal = until(() => text('#status').includes('Teal ·'), now);
      now = teal.now;
      expect(teal.frames).toBeLessThan(400);
      expect([1, 3, 5, 7]).toContain(render.mock.lastCall![0].selectedMoth);
    }, 60_000);

  it('switches moth after an attack as well as after a dance', () => {
    MATCH.scoring = 'incoming';
    MATCH.burnOut = true;
    MATCH.hotLamp = true;
    const cleanup = startApplication({
      mode: 'match',
      loadingSeconds: [0, 0],
      opening: false,
    });
    cleanups.push(cleanup);
    const scene = vi.mocked(createScene).mock.results.at(-1)?.value;
    const render = vi.mocked(scene.render);
    click('start');
    let now = 0;
    frame(now);
    const first = render.mock.lastCall![0].selectedMoth;
    key('KeyF');
    for (let hold = 0; hold < 5; hold++) frame((now += 20));
    key('KeyF', 'keyup');
    frame((now += 20));
    expect(text('#status')).toContain('resolving');
    const next = until(
      () => render.mock.lastCall![0].selectedMoth !== first,
      now,
    );
    expect(next.frames).toBeLessThan(250);
    expect(selected()).toEqual([render.mock.lastCall![0].selectedMoth]);
    expect(text('#status')).toContain('pick a moth');
  }, 60_000);
});
