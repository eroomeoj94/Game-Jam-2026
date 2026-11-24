// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { SETUP_KEY, readSetup } from './config';

afterEach(() => sessionStorage.removeItem(SETUP_KEY));

it('defaults to two teams, both played by people', () => {
  expect(readSetup()).toMatchObject({ teams: 2, humans: 2 });
});

it('reads the saved line-up, keeping it within what the game supports', () => {
  sessionStorage.setItem(SETUP_KEY, JSON.stringify({ teams: 4, humans: 1 }));
  expect(readSetup()).toMatchObject({ teams: 4, humans: 1, autostart: false });
  // No more people than teams, no fewer than two teams, never more than four.
  sessionStorage.setItem(SETUP_KEY, JSON.stringify({ teams: 9, humans: 7 }));
  expect(readSetup()).toMatchObject({ teams: 4, humans: 4 });
  sessionStorage.setItem(SETUP_KEY, JSON.stringify({ teams: 1, humans: 0 }));
  expect(readSetup()).toMatchObject({ teams: 2, humans: 1 });
  sessionStorage.setItem(SETUP_KEY, 'not json');
  expect(readSetup()).toMatchObject({ teams: 2, humans: 2 });
});
