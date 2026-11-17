// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createSfx } from './sfx';

function fakeSpeech() {
  const spoken: string[] = [];
  const speech = {
    cancel: vi.fn(),
    getVoices: () => [],
    speak: vi.fn((line: SpeechSynthesisUtterance) => spoken.push(line.text)),
  } as unknown as SpeechSynthesis;
  return { speech, spoken };
}

describe('sound effects', () => {
  it('shouts "Bosh!" on a punch, hit or miss, unless muted', () => {
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string;
        constructor(text: string) {
          this.text = text;
        }
      },
    );
    const { speech, spoken } = fakeSpeech();
    const sfx = createSfx({
      createContext: () => undefined,
      speech,
      findRecording: async () => undefined,
    });
    sfx.bosh(true);
    sfx.bosh(false);
    expect(spoken).toEqual(['Bosh!', 'Bosh!']);
    sfx.setMuted(true);
    sfx.bosh(true);
    expect(spoken).toHaveLength(2);
    expect(sfx.muted).toBe(true);
    sfx.destroy();
    vi.unstubAllGlobals();
  });

  it('keeps working without audio or speech support', () => {
    const sfx = createSfx({
      createContext: () => {
        throw new Error('no audio');
      },
      speech: undefined,
      findRecording: async () => undefined,
    });
    expect(() => {
      sfx.unlock();
      sfx.bosh(true);
    }).not.toThrow();
    sfx.destroy();
  });
});
