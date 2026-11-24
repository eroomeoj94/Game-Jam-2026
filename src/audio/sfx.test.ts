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

  it('chimes for points and plays a fanfare without needing any samples', async () => {
    const { sfx } = await loadedSfx();
    expect(() => {
      sfx.chime(0);
      sfx.chime(3);
      sfx.chime(9);
      sfx.fanfare();
      sfx.setMuted(true);
      sfx.chime(2);
      sfx.fanfare();
    }).not.toThrow();
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

describe('the announcer', () => {
  async function announcer(rolls: number[] = []) {
    const { context, started } = fakeAudio();
    const sfx = createSfx({
      createContext: () => context,
      speech: undefined,
      findRecording: async () => undefined,
      loadSample: async () => undefined,
      loadVoice: async (_ctx, file) =>
        ({ name: `voice:${file}`, duration: 1 }) as unknown as AudioBuffer,
      random: () => rolls.shift() ?? 0,
    });
    sfx.unlock();
    await Promise.resolve();
    await Promise.resolve();
    const spoken = () =>
      started
        .map(({ name }) => name)
        .filter((name) => name.startsWith('voice:'))
        .map((name) => name.slice(6));
    return { sfx, context, spoken };
  }

  it('speaks one line at a time unless a bigger moment cuts in', async () => {
    const { sfx, context, spoken } = await announcer();
    expect(sfx.say('bank')).toBe(true);
    // Another everyday line is dropped while he is talking.
    expect(sfx.say('turn0')).toBe(false);
    // A zap outranks it and cuts in.
    expect(sfx.say('zap', { priority: 2 })).toBe(true);
    expect(spoken()).toHaveLength(2);
    // Once he has finished, ordinary lines are welcome again.
    (context as unknown as { currentTime: number }).currentTime = 5;
    expect(sfx.say('turn0')).toBe(true);
    expect(spoken().at(-1)).toBe('turn-0');
    sfx.destroy();
  });

  it('varies the take, rolls for occasional lines and stays quiet when muted', async () => {
    const { sfx, context, spoken } = await announcer([0, 0, 0, 0, 0.9]);
    const clock = context as unknown as { currentTime: number };
    sfx.say('bosh');
    clock.currentTime = 5;
    sfx.say('bosh');
    expect(new Set(spoken()).size).toBe(2);
    clock.currentTime = 10;
    // A roll of 0.9 misses a 15% line.
    expect(sfx.say('dance', { chance: 0.15 })).toBe(false);
    sfx.setMuted(true);
    expect(sfx.say('zap', { priority: 3 })).toBe(false);
    expect(spoken()).toHaveLength(2);
    sfx.destroy();
  });

  it('calls a landed Bosh himself instead of the spoken fallback', async () => {
    const { sfx, spoken } = await announcer();
    sfx.bosh(true);
    expect(spoken()[0]).toMatch(/^bosh-/);
    sfx.destroy();
  });
});

describe('moth voices', () => {
  async function talkers() {
    const { context, started } = fakeAudio();
    const sfx = createSfx({
      createContext: () => context,
      speech: undefined,
      findRecording: async () => undefined,
      loadSample: async () => undefined,
      loadVoice: async (_ctx, file) =>
        ({ name: `voice:${file}`, duration: 1 }) as unknown as AudioBuffer,
      random: () => 0,
    });
    sfx.unlock();
    await Promise.resolve();
    await Promise.resolve();
    const spoken = () =>
      started
        .map(({ name }) => name)
        .filter((name) => name.startsWith('voice:'))
        .map((name) => name.slice(6));
    return { sfx, context, spoken };
  }

  it('gives each weapon its own lines, in the acting moth’s voice', async () => {
    const { sfx, context, spoken } = await talkers();
    const clock = context as unknown as { currentTime: number };
    sfx.quip(0, 'gust');
    clock.currentTime = 5;
    sfx.quip(1, 'firecracker');
    clock.currentTime = 10;
    // Moth 5 shares moth 1's voice; moth 0 gets a different take next time.
    sfx.quip(5, 'zap');
    clock.currentTime = 15;
    sfx.quip(0, 'gust');
    expect(spoken()).toEqual([
      'moth/a-gust-1',
      'moth/b-firecracker-1',
      'moth/b-zap-1',
      'moth/a-gust-2',
    ]);
    sfx.destroy();
  });

  it('waits for the announcer to finish instead of talking over him', async () => {
    const { sfx, spoken } = await talkers();
    expect(sfx.say('bosh', { priority: 2 })).toBe(true);
    expect(sfx.quip(2, 'bosh')).toBe(true);
    // A third voice on top of a queue is too much: it is dropped.
    expect(sfx.say('turn0')).toBe(false);
    expect(spoken()).toEqual(['bosh-1', 'moth/c-bosh-1']);
    sfx.destroy();
  });

  it('lets the announcer call a Bosh even when lines are already queued', async () => {
    for (const connected of [true, false]) {
      const { sfx, spoken } = await talkers();
      // He is mid-call and a moth is waiting its turn to speak: any other
      // line would be dropped, but the punch cuts in.
      expect(sfx.say('zap', { priority: 2 })).toBe(true);
      expect(sfx.quip(0, 'move')).toBe(true);
      expect(sfx.say('hot', { priority: 2 })).toBe(false);
      sfx.bosh(connected);
      expect(spoken().at(-1)).toMatch(connected ? /^bosh-/ : /^miss$/);
      sfx.destroy();
    }
  });
});

describe('music and sound-effect switches', () => {
  it('switches the music and the effects off separately', async () => {
    const { sfx, started } = await loadedSfx();
    const view = {
      lamps: [],
      projectiles: [],
      moths: [],
      selectedMoth: 0,
    } as unknown as Parameters<typeof sfx.update>[0];
    sfx.setMusic(false);
    sfx.update(view);
    // Effects still play, the room tone loops, and the tune stays silent.
    sfx.playEvents([{ type: 'gust', origin: here, direction }], here);
    expect(started.map(({ name }) => name)).toEqual(['ambience', 'whoosh']);
    expect(sfx.muted).toBe(false);
    sfx.setEffects(false);
    sfx.setMusic(true);
    sfx.update(view);
    sfx.playEvents([{ type: 'gust', origin: here, direction }], here);
    // Now only the tune starts; nothing else makes a sound.
    expect(started.map(({ name }) => name)).toEqual([
      'ambience',
      'whoosh',
      'music',
    ]);
    expect(sfx).toMatchObject({ music: true, effects: false, muted: false });
    sfx.setMuted(true);
    expect(sfx).toMatchObject({ music: false, effects: false, muted: true });
    sfx.destroy();
  });
});
