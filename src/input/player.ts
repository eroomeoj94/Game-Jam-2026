const MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
  'Space',
  'KeyF',
]);

/** Tracks held movement separately from a one-shot jump, at simulation cadence. */
export function createPlayerInput(
  onSelect: (id: number) => void,
  onToggleView: () => void = () => {},
  onWeapon: (step: number) => void = () => {},
) {
  const held = new Set<string>();
  let jumpQueued = false;
  const clear = () => {
    held.clear();
    jumpQueued = false;
  };
  const keyDown = (event: KeyboardEvent) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest('input, textarea, select, [contenteditable="true"]')
    )
      return;
    if (event.altKey || event.ctrlKey || event.metaKey || document.hidden)
      return;
    const digit = /^Digit([1-9])$/.exec(event.code);
    if (digit) {
      event.preventDefault();
      if (!event.repeat) onSelect(Number(digit[1]) - 1);
      return;
    }
    if (event.code === 'KeyQ' || event.code === 'KeyE') {
      event.preventDefault();
      if (!event.repeat) onWeapon(event.code === 'KeyQ' ? -1 : 1);
      return;
    }
    if (event.code === 'KeyV') {
      event.preventDefault();
      if (!event.repeat) onToggleView();
      return;
    }
    if (!MOVE_KEYS.has(event.code)) return;
    if (event.repeat && !held.has(event.code)) return;
    // Leave Space/Enter activation on a focused HTML button to the browser.
    if (
      event.code === 'Space' &&
      event.target instanceof HTMLElement &&
      event.target.closest('button')
    )
      return;
    event.preventDefault();
    if (event.code === 'Space' && !held.has('Space') && !event.repeat)
      jumpQueued = true;
    held.add(event.code);
  };
  const keyUp = (event: KeyboardEvent) => {
    held.delete(event.code);
  };
  const visibility = () => {
    if (document.hidden) clear();
  };
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', visibility);
  return {
    clear,
    read() {
      const jump = jumpQueued;
      jumpQueued = false;
      return {
        x:
          Number(held.has('KeyD') || held.has('ArrowRight')) -
          Number(held.has('KeyA') || held.has('ArrowLeft')),
        z:
          Number(held.has('KeyS') || held.has('ArrowDown')) -
          Number(held.has('KeyW') || held.has('ArrowUp')),
        jump,
        flutter: held.has('Space'),
      };
    },
    /** True while the fire key is held: aim and charge, release to fire. */
    fireHeld() {
      return held.has('KeyF');
    },
    destroy() {
      clear();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}
