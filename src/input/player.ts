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
]);

/** Tracks held movement separately from a one-shot jump, at simulation cadence. */
export function createPlayerInput(onSelect: (id: number) => void) {
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
    if (event.code === 'Digit1' || event.code === 'Digit2') {
      event.preventDefault();
      if (!event.repeat) onSelect(event.code === 'Digit1' ? 0 : 1);
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
    destroy() {
      clear();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}
