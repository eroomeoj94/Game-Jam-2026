// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { SETUP_KEY, readSetup } from './config';

afterEach(() => sessionStorage.removeItem(SETUP_KEY));

it('defaults to two teams, both played by people', () => {
  expect(readSetup()).toMatchObject({ teams: 2, humans: 2, moths: 4 });
});

it('gives each number of teams its usual team size, unless one is chosen', () => {
  for (const [teams, moths] of [
    [2, 4],
    [3, 3],
    [4, 2],
  ]) {
    sessionStorage.setItem(SETUP_KEY, JSON.stringify({ teams, humans: 1 }));
    expect(readSetup().moths).toBe(moths);
  }
  sessionStorage.setItem(
    SETUP_KEY,
    JSON.stringify({ teams: 4, humans: 1, moths: 5 }),
  );
  expect(readSetup().moths).toBe(5);
  // Never more than five, never fewer than one.
  sessionStorage.setItem(
    SETUP_KEY,
    JSON.stringify({ teams: 2, humans: 1, moths: 12 }),
  );
  expect(readSetup().moths).toBe(5);
  sessionStorage.setItem(
    SETUP_KEY,
    JSON.stringify({ teams: 2, humans: 1, moths: 0 }),
  );
  expect(readSetup().moths).toBe(1);
});

it('reads the saved line-up, keeping it within what the game supports', () => {
  sessionStorage.setItem(SETUP_KEY, JSON.stringify({ teams: 4, humans: 1 }));
  expect(readSetup()).toMatchObject({ teams: 4, humans: 1, autostart: false });
  // No more people than teams, no fewer than two teams, never more than four.
  sessionStorage.setItem(SETUP_KEY, JSON.stringify({ teams: 9, humans: 7 }));
  expect(readSetup()).toMatchObject({ teams: 4, humans: 4 });
  sessionStorage.setItem(SETUP_KEY, JSON.stringify({ teams: 1, humans: 0 }));
  expect(readSetup()).toMatchObject({ teams: 2, humans: 0 });
  sessionStorage.setItem(SETUP_KEY, JSON.stringify({ teams: 3, humans: -4 }));
  expect(readSetup()).toMatchObject({ teams: 3, humans: 0 });
  sessionStorage.setItem(SETUP_KEY, 'not json');
  expect(readSetup()).toMatchObject({ teams: 2, humans: 2 });
});
