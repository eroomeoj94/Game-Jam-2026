// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createSfx, normalisingGain } from './sfx';

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

/** A fake Web Audio context that records which samples start, and how loud. */
function fakeAudio() {
  const started: { name: string; volume: number; loop: boolean }[] = [];
  const param = (value = 1) => ({
    value,
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = () => {
    const self: Record<string, unknown> = {
      gain: param(),
      frequency: param(),
      connect: (next: unknown) => next,
    };
    return self;
  };
  const context = {
    state: 'running',
    currentTime: 0,
    sampleRate: 8000,
    destination: node(),
    resume: vi.fn(),
    close: vi.fn(async () => undefined),
    createGain: () => node(),
    createBiquadFilter: () => ({ ...node(), type: '' }),
    createOscillator: () => ({
      ...node(),
      type: '',
      start: vi.fn(),
      stop: vi.fn(),
    }),
    createBuffer: (_c: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => {
      const gainNode = { gain: param() };
      const source = {
        buffer: undefined as { name: string } | undefined,
        loop: false,
        playbackRate: param(),
        connect: (next: { gain?: { value: number } }) => {
          Object.assign(gainNode, next);
          return next;
        },
        start: vi.fn(() =>
          started.push({
            name: source.buffer?.name ?? 'synth',
            volume: gainNode.gain.value,
            loop: source.loop,
          }),
        ),
        stop: vi.fn(),
      };
      return source;
    },
  };
  return { context: context as unknown as AudioContext, started };
}

async function loadedSfx() {
  const { context, started } = fakeAudio();
  const sfx = createSfx({
    createContext: () => context,
    speech: undefined,
    findRecording: async () => undefined,
    loadSample: async (_ctx, name) =>
      ({ name, duration: 2 }) as unknown as AudioBuffer,
  });
  sfx.unlock();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { sfx, started };
}

const here = { x: 0, y: 0.5, z: 0 };
const direction = { x: 1, z: 0 };

describe('sampled sound effects', () => {
  it('plays the matching sample for each game event', async () => {
    const { sfx, started } = await loadedSfx();
    sfx.playEvents([{ type: 'gust', origin: here, direction }], here);
    sfx.playEvents(
      [
        { type: 'hit', moth: 1, position: here },
        { type: 'bosh', origin: here, direction, moth: 1, position: here },
      ],
      here,
    );
    sfx.playEvents([{ type: 'explode', position: here }], here);
    sfx.playEvents(
      [{ type: 'zap', moth: 1, team: 1, lamp: 0, position: here }],
      here,
    );
    sfx.playEvents([{ type: 'lamp', lamp: 0, zapper: true }], here);
    sfx.playEvents([{ type: 'launch', kind: 'cap', position: here }], here);
    expect(started.map(({ name }) => name)).toEqual([
      'whoosh',
      // A landed Bosh is layered: wind-up, smack, boom and two echoes. It
      // also covers the knock it causes, so that is not heard separately.
      'swish',
      'punch',
      // The synthesised sub-bass thump under the smack.
      'synth',
      'bang',
      'punch',
      'punch',
      'bang',
      'zap',
      'switch',
      'zap',
      'pop',
    ]);
  });

  it('gives a giant hand a whoosh overhead, then a slap and a boom', async () => {
    const { sfx, started } = await loadedSfx();
    sfx.playEvents([{ type: 'loom', position: here }], here);
    expect(started.map(({ name }) => name)).toEqual(['whoosh']);
    started.length = 0;
    // Far across the desk it is still plainly heard.
    const far = { x: 500, y: 0, z: 0 };
    sfx.playEvents(
      [
        { type: 'hit', moth: 1, position: far },
        { type: 'smack', position: far, moths: 1 },
      ],
      here,
    );
    const names = started.map(({ name }) => name);
    expect(names).toContain('bang');
    expect(names).toContain('synth');
    // The slap itself, and it covers the knock it causes.
    expect(names[0]).toBe('slap');
    expect(started[0]!.volume).toBeGreaterThan(1);
    expect(names.filter((name) => name === 'punch')).toHaveLength(1);
  });

  it('makes distant events quieter and stays silent when muted', async () => {
    const { sfx, started } = await loadedSfx();
    sfx.playEvents([{ type: 'explode', position: here }], here);
    sfx.playEvents(
      [{ type: 'explode', position: { x: 90, y: 0.5, z: 0 } }],
      here,
    );
    expect(started[1]!.volume).toBeLessThan(started[0]!.volume / 2);
    sfx.setMuted(true);
    sfx.playEvents([{ type: 'explode', position: here }], here);
    expect(started).toHaveLength(2);
  });

  it('loops the ambience and music, and the zapper hum only while a zapper is on', async () => {
    const { sfx, started } = await loadedSfx();
    const view = (zapper: boolean) =>
      ({
        lamps: [{ x: 0, y: 5, z: 0, anchor: here, zapper, zapperLeft: 1 }],
        projectiles: [],
        moths: [],
        selectedMoth: 0,
        weaponCooldown: 0,
        teamZaps: [0, 0],
      }) as unknown as import('../game/world').WorldView;
    sfx.update(view(false), here);
    expect(started.filter((item) => item.loop).map(({ name }) => name)).toEqual(
      ['ambience', 'music'],
    );
    sfx.update(view(true), here);
    sfx.update(view(true), here);
    expect(started.filter((item) => item.name === 'zapper-hum')).toHaveLength(
      1,
    );
  });
});

describe('loudness and status', () => {
  it('boosts quiet samples and tames loud ones to the same peak', () => {
    const buffer = (peak: number) =>
      ({
        numberOfChannels: 1,
        getChannelData: () => new Float32Array([0, peak, -peak / 2]),
      }) as unknown as AudioBuffer;
    expect(normalisingGain(buffer(0.09)) * 0.09).toBeCloseTo(0.9);
    expect(normalisingGain(buffer(1)) * 1).toBeCloseTo(0.9);
    // Near-silent clips are not boosted into noise.
    expect(normalisingGain(buffer(0.00001))).toBe(1);
  });

  it('reports waiting until audio starts, then on, or unsupported', async () => {
    const { sfx } = await loadedSfx();
    expect(sfx.status).toBe('on');
    const pending = createSfx({
      createContext: () => undefined,
      speech: undefined,
      findRecording: async () => undefined,
    });
    expect(pending.status).toBe('waiting');
    pending.unlock();
    expect(pending.status).toBe('unsupported');
  });
});
