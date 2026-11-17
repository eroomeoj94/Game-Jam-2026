import { describe, expect, it } from 'vitest';
import { createGamepadInput } from './gamepad';
import type { GamepadState } from './gamepad';

function pad(options: Partial<GamepadState> = {}): GamepadState {
  return {
    id: 'DualSense test controller',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: [],
    ...options,
  };
}
function buttons(...pressed: number[]) {
  return Array.from({ length: 17 }, (_, index) => ({
    pressed: pressed.includes(index),
  }));
}

describe('standard-mapped PS5 controls', () => {
  it('filters stick drift, preserves analog strength, and normalizes diagonals', () => {
    let state = pad();
    const input = createGamepadInput(() => [state]);
    input.poll();
    state = pad({ axes: [0.1, -0.1, 0, 0] });
    input.poll();
    expect(input.read()).toMatchObject({ x: 0, z: 0 });
    state = pad({ axes: [0.59, 0, 0, 0] });
    input.poll();
    expect(input.read().x).toBeCloseTo(0.5);
    state = pad({ axes: [1, 1, 0, 0] });
    input.poll();
    const move = input.read();
    expect(Math.hypot(move.x, move.z)).toBeCloseTo(1);
  });

  it('queues one Cross jump across render frames while holding flutter', () => {
    let state = pad();
    const input = createGamepadInput(() => [state]);
    input.poll();
    state = pad({ buttons: buttons(0) });
    input.poll();
    input.poll(); // A high-refresh display may render twice before a physics tick.
    expect(input.read()).toMatchObject({ jump: true, flutter: true });
    input.poll();
    expect(input.read()).toMatchObject({ jump: false, flutter: true });
    state = pad();
    input.poll();
    expect(input.read().flutter).toBe(false);
    state = pad({ buttons: buttons(0) });
    input.poll();
    expect(input.read().jump).toBe(true);
  });

  it('maps shoulders, Triangle, and right stick without repeating held actions', () => {
    let state = pad();
    const input = createGamepadInput(() => [state]);
    input.poll();
    state = pad({ buttons: buttons(5, 3), axes: [0, 0, 0.8, -0.5] });
    expect(input.poll()).toMatchObject({ switchMoth: 1, toggleView: true });
    expect(input.poll()).toMatchObject({ switchMoth: 0, toggleView: false });
    expect(input.poll().lookX).toBeGreaterThan(0);
    expect(input.poll().lookY).toBeLessThan(0);
    state = pad();
    input.poll();
    state = pad({ buttons: buttons(4) });
    expect(input.poll().switchMoth).toBe(-1);
  });

  it('changes weapon once per D-pad press and holds fire on R2 or Square', () => {
    let state = pad();
    const input = createGamepadInput(() => [state]);
    input.poll();
    state = pad({ buttons: buttons(15, 7) });
    expect(input.poll()).toMatchObject({ weaponStep: 1, fire: true });
    expect(input.poll()).toMatchObject({ weaponStep: 0, fire: true });
    state = pad({ buttons: buttons(14, 2) });
    expect(input.poll()).toMatchObject({ weaponStep: -1, fire: true });
    state = pad();
    expect(input.poll().fire).toBe(false);
  });

  it('clears held controls on disconnect and requires neutral input after reconnect or focus loss', () => {
    let state: GamepadState | null = pad();
    const input = createGamepadInput(() => [state]);
    input.poll();
    state = pad({ axes: [1, 0, 0, 0], buttons: buttons(0) });
    input.poll();
    expect(input.read().x).toBe(1);
    state = null;
    input.poll();
    expect(input.read()).toEqual({ x: 0, z: 0, jump: false, flutter: false });
    state = pad({ axes: [1, 0, 0, 0], buttons: buttons(0) });
    expect(input.poll().text).toContain('release');
    expect(input.read().x).toBe(0);
    state = pad();
    input.poll();
    state = pad({ axes: [1, 0, 0, 0] });
    input.poll();
    expect(input.read().x).toBe(1);
    input.clear();
    input.poll();
    expect(input.read().x).toBe(0);
  });

  it('handles no API, sparse slots, unmapped devices, and denied access without crashing', () => {
    const missing = createGamepadInput(() => []);
    expect(missing.poll().text).toContain('connect');
    const unmapped = createGamepadInput(() => [null, pad({ mapping: '' })]);
    expect(unmapped.poll().text).toContain('unsupported');
    const denied = createGamepadInput(() => {
      throw new Error('SecurityError');
    });
    expect(() => denied.poll()).not.toThrow();
    const sparse = createGamepadInput(() => [null, pad({ index: 1 })]);
    expect(sparse.poll().text).toContain('ready');
  });
});
