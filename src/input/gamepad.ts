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
  /** Which way the left stick was last pushed up or down, for menus. */
  let stickStep = 0;
  function clear() {
    movement = idle();
    queuedJump = false;
    needsNeutral = true;
    stickStep = 0;
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
        /** -1 / +1 when the D-pad changes weapon this frame. */
        weaponStep: 0,
        /** True while R2 or Square is held: aim and charge, release to fire. */
        fire: false,
        /** True when Circle is pressed this frame: pass the turn. */
        pass: false,
        /** True while L2 is held: the weapon wheel is open. */
        wheel: false,
        /** Where the left stick points while the wheel is open, if anywhere. */
        wheelAim: undefined as { x: number; z: number } | undefined,
        /** True when Options is pressed this frame: open or shut the menu. */
        menu: false,
        /** -1 / +1 when the D-pad or left stick steps up or down a menu. */
        menuStep: 0,
        /** True when Cross is pressed this frame: choose the menu's button. */
        confirm: false,
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
      queuedJump ||= justPressed(0) && !pressed.has(6); // Cross on a standard-mapped DualSense.
      // L2 opens the weapon wheel: the left stick then picks from it, and
      // the moth stands still.
      status.wheel = pressed.has(6);
      if (status.wheel && Math.hypot(move.x, move.z) > 0.5)
        status.wheelAim = move;
      movement = status.wheel
        ? idle()
        : { ...move, jump: false, flutter: pressed.has(0) };
      status.lookX = look.x;
      status.lookY = look.z;
      status.switchMoth = justPressed(5) ? 1 : justPressed(4) ? -1 : 0;
      status.toggleView = justPressed(3); // Triangle: shoulder ⇄ board view.
      status.resetView = justPressed(11); // R3: re-centre the camera.
      status.weaponStep = justPressed(15) ? 1 : justPressed(14) ? -1 : 0;
      // R2 or Square, but not while choosing a weapon.
      status.fire = !status.wheel && (pressed.has(7) || pressed.has(2));
      status.pass = justPressed(1); // Circle.
      status.menu = justPressed(9); // Options.
      status.confirm = justPressed(0);
      // One step per push of the stick, however long it is held over.
      const pushed = Math.abs(move.z) > 0.6 ? Math.sign(move.z) : 0;
      status.menuStep = justPressed(13)
        ? 1
        : justPressed(12)
          ? -1
          : pushed !== stickStep
            ? pushed
            : 0;
      stickStep = pushed;
      status.text =
        'Controller ready · Cross: hop / flutter · R2: aim, release to fire · L2: weapon wheel · Options: menu';
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
