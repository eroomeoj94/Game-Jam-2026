import type { MovementCommand } from '../game/world';

export type GamepadState = {
  id: string;
  index: number;
  mapping: string;
  connected: boolean;
  axes: readonly number[];
  buttons: readonly { pressed: boolean }[];
};
const DEAD_ZONE = 0.18;
const idle = (): MovementCommand => ({
  x: 0,
  z: 0,
  jump: false,
  flutter: false,
});

function stick(axes: readonly number[], offset: number) {
  const x = Number.isFinite(axes[offset]) ? axes[offset]! : 0;
  const z = Number.isFinite(axes[offset + 1]) ? axes[offset + 1]! : 0;
  const length = Math.hypot(x, z);
  if (length <= DEAD_ZONE) return { x: 0, z: 0 };
  const strength = (Math.min(length, 1) - DEAD_ZONE) / (1 - DEAD_ZONE);
  return { x: (x / length) * strength, z: (z / length) * strength };
}

/** Poll fresh browser snapshots; only standard mapping is safe to interpret. */
export function createGamepadInput(
  readPads: () => readonly (GamepadState | null)[] = () =>
    navigator.getGamepads?.() ?? [],
) {
  let identity = '';
  let previous = new Set<number>();
  let movement = idle();
  let queuedJump = false;
  let needsNeutral = true;
  function clear() {
    movement = idle();
    queuedJump = false;
    needsNeutral = true;
    previous.clear();
  }
  return {
    clear,
    poll() {
      let pads: readonly (GamepadState | null)[];
      try {
        pads = readPads();
      } catch {
        pads = [];
      }
      const supported = pads.filter(
        (pad): pad is GamepadState =>
          !!pad?.connected && pad.mapping === 'standard',
      );
      const pad =
        supported.find((pad) => `${pad.index}:${pad.id}` === identity) ??
        supported[0];
      const status = {
        text: 'Controller: connect, then press a button',
        lookX: 0,
        lookY: 0,
        switchMoth: 0,
        resetView: false,
        toggleView: false,
      };
      if (!pad) {
        identity = '';
        clear();
        if (pads.some((pad) => pad?.connected))
          status.text = 'Controller mapping unsupported — use keyboard';
        return status;
      }
      const id = `${pad.index}:${pad.id}`;
      if (identity !== id) {
        clear();
        identity = id;
      }
      const pressed = new Set(
        pad.buttons.flatMap((button, i) => (button.pressed ? [i] : [])),
      );
      const move = stick(pad.axes, 0);
      const look = stick(pad.axes, 2);
      if (needsNeutral) {
        if (pressed.size || move.x || move.z || look.x || look.z) {
          status.text = 'Controller connected — release sticks and buttons';
          return status;
        }
        needsNeutral = false;
      }
      const justPressed = (button: number) =>
        pressed.has(button) && !previous.has(button);
      queuedJump ||= justPressed(0); // Cross on a standard-mapped DualSense.
      movement = { ...move, jump: false, flutter: pressed.has(0) };
      status.lookX = look.x;
      status.lookY = look.z;
      status.switchMoth = justPressed(5) ? 1 : justPressed(4) ? -1 : 0;
      status.toggleView = justPressed(3); // Triangle: shoulder ⇄ board view.
      status.resetView = justPressed(11); // R3: re-centre the camera.
      status.text = 'Controller ready · Cross: hop / hold flutter';
      previous = pressed;
      return status;
    },
    read() {
      const command = { ...movement, jump: queuedJump };
      queuedJump = false;
      return command;
    },
  };
}
