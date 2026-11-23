import { AUDIO, BOSH, HAZARD } from '../config';
import type { Position, WorldEvent, WorldView } from '../game/world';

/** Optional recording: drop a file here to replace the spoken "Bosh!". */
export const BOSH_RECORDING = 'sounds/bosh.mp3';

/**
 * Sound samples, loaded from `public/sounds/artlist/` when present: `.aac`
 * for effects and `music.mp3` for the background tune.
 * They are Artlist sounds licensed to whoever downloaded them, so they
 * are not in the repository; see `public/sounds/README.md`. Without them the
 * game falls back to small synthesised sounds.
 */
export const SAMPLES = [
  'punch',
  'slap',
  'whoosh',
  'swish',
  'zap',
  'zapper-hum',
  'switch',
  'bang',
  'fuse',
  'pop',
  'flutter',
  'ambience',
  'music',
] as const;
export type SampleName = (typeof SAMPLES)[number];
const samplePath = (name: SampleName) =>
  `sounds/artlist/${name}.${name === 'music' ? 'mp3' : 'aac'}`;

/**
 * The announcer: short spoken lines for the big moments, generated with an
 * Artlist voice and loaded from `public/sounds/artlist/voice/` when present.
 * Each cue has one or more takes; one is picked at random.
 */
export const VOICE_LINES = {
  start: ['start-1', 'start-2'],
  round1: ['round-1'],
  round2: ['round-2'],
  round3: ['round-3'],
  round: ['round-next'],
  turn0: ['turn-0'],
  turn1: ['turn-1'],
  bosh: ['bosh-1', 'bosh-2', 'bosh-3'],
  miss: ['miss'],
  zap: ['zap-1', 'zap-2', 'zap-3'],
  zapper: ['zapper'],
  hand: ['hand-1', 'hand-2'],
  smack: ['smack-1', 'smack-2'],
  hot: ['hot'],
  burn: ['burn'],
  bank: ['bank-1', 'bank-2'],
  fall: ['fall-1', 'fall-2'],
  bang: ['bang'],
  dance: ['dance'],
  gust: ['gust'],
  matchpoint: ['matchpoint'],
  win0: ['win-0'],
  win1: ['win-1'],
  winEnd: ['win-end'],
} as const;
export type VoiceCue = keyof typeof VOICE_LINES;
/**
 * The moths talk too: a line after every move and every action, with its own
 * pool for each weapon. Four voices, shared out by moth number, two takes of
 * each cue per voice; the clips sit in `voice/moth/`.
 */
export const MOTH_VOICES = ['a', 'b', 'c', 'd'] as const;
export const MOTH_CUES = [
  'gust',
  'bosh',
  'zap',
  'cap',
  'firecracker',
  'dance',
  'move',
] as const;
export type MothCue = (typeof MOTH_CUES)[number];
const mothTakes = (moth: number, cue: MothCue) => {
  const voice = MOTH_VOICES[moth % MOTH_VOICES.length]!;
  return [1, 2].map((take) => `moth/${voice}-${cue}-${take}`);
};
const voicePath = (file: string) => `sounds/artlist/voice/${file}.mp3`;

/** Every sample is boosted or cut so its loudest moment peaks here. */
const TARGET_PEAK = 0.9;

/**
 * Gain that brings a sample's peak to TARGET_PEAK. Catalogue clips arrive
 * at very different levels (the night room tone peaks around −21 dB), so
 * without this some are inaudible next to others.
 */
export function normalisingGain(buffer: AudioBuffer) {
  if (typeof buffer.getChannelData !== 'function') return 1;
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      const level = Math.abs(data[i]!);
      if (level > peak) peak = level;
    }
  }
  return peak > 1e-4 ? Math.min(12, Math.max(0.25, TARGET_PEAK / peak)) : 1;
}

type Dependencies = {
  createContext?: () => AudioContext | undefined;
  speech?: SpeechSynthesis | undefined;
  /** Resolves to a playable recording URL, or undefined when there is none. */
  findRecording?: () => Promise<string | undefined>;
  /** Fetches and decodes one sample; undefined when it is not available. */
  loadSample?: (
    context: AudioContext,
    name: SampleName,
  ) => Promise<AudioBuffer | undefined>;
  /** Fetches and decodes one announcer clip, by file name. */
  loadVoice?: (
    context: AudioContext,
    file: string,
  ) => Promise<AudioBuffer | undefined>;
  random?: () => number;
};

/** Ask the server whether the optional recording exists. */
async function findBoshRecording() {
  try {
    const response = await fetch(BOSH_RECORDING, { method: 'HEAD' });
    // Vite answers unknown paths with the HTML page, so check the type too.
    const type = response.headers.get('content-type') ?? '';
    return response.ok && type.startsWith('audio') ? BOSH_RECORDING : undefined;
  } catch {
    return undefined;
  }
}

async function fetchSample(context: AudioContext, name: SampleName) {
  try {
    const response = await fetch(samplePath(name));
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || type.includes('html')) return undefined;
    return await context.decodeAudioData(await response.arrayBuffer());
  } catch {
    return undefined;
  }
}

async function fetchVoice(context: AudioContext, file: string) {
  try {
    const response = await fetch(voicePath(file));
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || type.includes('html')) return undefined;
    return await context.decodeAudioData(await response.arrayBuffer());
  } catch {
    return undefined;
  }
}

/** Quieter with distance from the listener, so far-off fights stay faint. */
function attenuation(listener: Position | undefined, at: Position | undefined) {
  if (!listener || !at) return 1;
  const distance = Math.hypot(at.x - listener.x, at.z - listener.z);
  return 1 / (1 + distance / AUDIO.falloff);
}

/**
 * Game sound: sampled effects with synthesised fallbacks, looping beds for
 * the room, zappers, fuses and flutter, and the spoken "Bosh!". Browsers only
 * allow audio after a user gesture, so call `unlock()` from the first key
 * press or click.
 */
export function createSfx({
  createContext = () => {
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    return Context ? new Context() : undefined;
  },
  speech = typeof window !== 'undefined' ? window.speechSynthesis : undefined,
  findRecording = findBoshRecording,
  loadSample = fetchSample,
  // A caller that supplies its own samples gets no announcer unless it
  // supplies those clips too.
  loadVoice = loadSample === fetchSample ? fetchVoice : async () => undefined,
  random = Math.random,
}: Dependencies = {}) {
  const voices = new Map<string, AudioBuffer>();
  const voiceMakeup = new Map<string, number>();
  const lastTake = new Map<string, string>();
  /**
   * The line being spoken and any queued behind it, so a bigger moment can
   * cut in over them.
   */
  let speaking:
    | { sources: AudioBufferSourceNode[]; until: number; priority: number }
    | undefined;
  /** A line asked for before its clip had loaded, tried again on arrival. */
  let waiting: { cue: VoiceCue; priority: number; expires: number } | undefined;
  let context: AudioContext | undefined;
  let effects: GainNode | undefined;
  let beds: GainNode | undefined;
  let duck: GainNode | undefined;
  let muted = false;
  let loading = false;
  let unsupported = false;
  let recording: HTMLAudioElement | undefined;
  const buffers = new Map<SampleName, AudioBuffer>();
  const makeup = new Map<SampleName, number>();
  const loops = new Map<
    SampleName,
    { source: AudioBufferSourceNode; gain: GainNode }
  >();
  void findRecording().then((url) => {
    if (url) recording = new Audio(url);
  });

  function audio() {
    if (!context) {
      try {
        context = createContext();
      } catch {
        context = undefined;
      }
      unsupported = !context;
      if (context) {
        // Two mix buses: effects, and the looping beds underneath them.
        effects = context.createGain();
        beds = context.createGain();
        // A limiter lets the big hits be pushed well past full volume and
        // come out loud and thick instead of crackling.
        const limiter = context.createDynamicsCompressor?.();
        if (limiter) {
          limiter.threshold.value = -14;
          limiter.knee.value = 6;
          limiter.ratio.value = 20;
          limiter.attack.value = 0.002;
          limiter.release.value = 0.14;
          effects.connect(limiter).connect(context.destination);
        } else effects.connect(context.destination);
        // The music and room tone dip out of the way of those hits.
        duck = context.createGain();
        beds.connect(duck).connect(context.destination);
        applyVolumes();
      }
    }
    if (context?.state === 'suspended') void context.resume();
    return context;
  }

  let appliedVolumes = '';
  function applyVolumes() {
    if (!context || !effects || !beds) return;
    const master = muted ? 0 : AUDIO.master;
    // Only reschedule the mix when a setting actually changed.
    const key = `${master}:${AUDIO.effects}`;
    if (key === appliedVolumes) return;
    appliedVolumes = key;
    effects.gain.setTargetAtTime(
      master * AUDIO.effects,
      context.currentTime,
      0.05,
    );
    beds.gain.setTargetAtTime(master, context.currentTime, 0.2);
  }

  function load(ctx: AudioContext) {
    if (loading) return;
    loading = true;
    for (const name of SAMPLES)
      void loadSample(ctx, name).then((buffer) => {
        if (!buffer) return;
        makeup.set(name, normalisingGain(buffer));
        buffers.set(name, buffer);
      });
    const mothFiles = MOTH_VOICES.flatMap((_, moth) =>
      MOTH_CUES.flatMap((cue) => mothTakes(moth, cue)),
    );
    for (const file of [...Object.values(VOICE_LINES).flat(), ...mothFiles])
      void loadVoice(ctx, file).then((buffer) => {
        if (!buffer) return;
        voiceMakeup.set(file, normalisingGain(buffer));
        voices.set(file, buffer);
        if (!waiting) return;
        const { cue, priority, expires } = waiting;
        if (ctx.currentTime > expires) waiting = undefined;
        else if (say(cue, { priority })) waiting = undefined;
      });
  }

  /**
   * Speak one of `files`. One voice at a time: a line that does not outrank
   * the one in progress waits its turn if it matters (priority 2 or more)
   * and the wait is short, and is dropped otherwise; one that outranks it
   * cuts it off. Returns whether it spoke or is about to.
   */
  function speak(
    files: readonly string[],
    key: string,
    volume: number,
    { priority = 1, chance = 1 }: { priority?: number; chance?: number } = {},
  ) {
    const ctx = context;
    if (!ctx || !effects || muted) return undefined;
    const takes = files.filter((file) => voices.has(file));
    if (!takes.length) return false;
    const now = ctx.currentTime;
    const busy = !!speaking && now < speaking.until;
    const outranks = !busy || priority > speaking!.priority;
    const wait = busy && !outranks ? speaking!.until - now : 0;
    if (!outranks && (priority < 2 || wait > 2)) return undefined;
    if (random() >= chance) return undefined;
    const fresh = takes.filter((file) => file !== lastTake.get(key));
    const pool = fresh.length ? fresh : takes;
    const file = pool[Math.floor(random() * pool.length)]!;
    const buffer = voices.get(file)!;
    if (busy && outranks)
      for (const source of speaking!.sources) {
        try {
          source.stop();
        } catch {
          // Already finished.
        }
      }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume * (voiceMakeup.get(file) ?? 1);
    source.connect(gain).connect(effects);
    source.start(now + wait);
    lastTake.set(key, file);
    speaking = {
      sources: wait ? [...speaking!.sources, source] : [source],
      until: now + wait + buffer.duration + 0.2,
      priority: wait ? speaking!.priority : priority,
    };
    // The music steps back while anyone is talking.
    dip(0.4, wait + buffer.duration);
    return true;
  }

  /** Have the announcer speak a line. `chance` makes common cues occasional. */
  function say(
    cue: VoiceCue,
    options: { priority?: number; chance?: number } = {},
  ) {
    const spoke = speak(VOICE_LINES[cue], cue, AUDIO.voice, options);
    // Still loading: keep the most important line for a few seconds.
    if (
      spoke === false &&
      context &&
      loading &&
      voices.size === 0 &&
      (options.priority ?? 1) >= (waiting?.priority ?? 0)
    )
      waiting = {
        cue,
        priority: options.priority ?? 1,
        expires: context.currentTime + 4,
      };
    return spoke === true;
  }

  /** A moth says its piece after a move or an action, in its own voice. */
  function quip(moth: number, cue: MothCue) {
    const voice = MOTH_VOICES[moth % MOTH_VOICES.length];
    return (
      speak(mothTakes(moth, cue), `${voice}-${cue}`, AUDIO.mothVoice, {
        priority: 2,
      }) === true
    );
  }

  /** Play a sample once; false when it is not loaded (use a fallback). */
  function play(
    name: SampleName,
    {
      volume = 1,
      rate = 1,
      delay = 0,
    }: { volume?: number; rate?: number; delay?: number } = {},
  ) {
    const ctx = context;
    const buffer = buffers.get(name);
    if (!ctx || !effects || !buffer || muted) return false;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = volume * (makeup.get(name) ?? 1);
    source.connect(gain).connect(effects);
    source.start(ctx.currentTime + delay);
    return true;
  }

  /** Fade a looping sample towards `volume`; 0 fades it out and stops it. */
  function loop(name: SampleName, level: number, fromStart = false) {
    const ctx = context;
    if (!ctx || !beds) return;
    const volume = level * (makeup.get(name) ?? 1);
    const running = loops.get(name);
    if (volume <= 0.001) {
      if (!running) return;
      running.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
      running.source.stop(ctx.currentTime + 0.6);
      loops.delete(name);
      return;
    }
    if (running) {
      running.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.12);
      return;
    }
    const buffer = buffers.get(name);
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.12);
    source.connect(gain).connect(beds);
    // Start somewhere random so repeated loops do not sound identical.
    source.start(0, fromStart ? 0 : Math.random() * buffer.duration);
    loops.set(name, { source, gain });
  }

  /** Synthesised fallbacks, used when a sample is missing. */
  function thump(ctx: AudioContext, volume = 0.9) {
    if (!effects) return;
    const now = ctx.currentTime;
    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(150, now);
    body.frequency.exponentialRampToValueAtTime(42, now + 0.22);
    bodyGain.gain.setValueAtTime(volume, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    body.connect(bodyGain).connect(effects);
    body.start(now);
    body.stop(now + 0.32);
    noise(ctx, 0.08, 1800, volume * 0.55);
  }
  function noise(
    ctx: AudioContext,
    seconds: number,
    frequency: number,
    volume: number,
  ) {
    if (!effects) return;
    const now = ctx.currentTime;
    const buffer = ctx.createBuffer(
      1,
      Math.ceil(ctx.sampleRate * seconds),
      ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    source.connect(filter).connect(gain).connect(effects);
    source.start(now);
  }

  /** A soft bell-like note, `delay` seconds from now. */
  function tone(
    ctx: AudioContext,
    pitch: number,
    delay: number,
    seconds: number,
    volume: number,
  ) {
    if (!effects) return;
    const start = ctx.currentTime + delay;
    for (const [multiple, level] of [
      [1, 1],
      [2, 0.35],
    ] as const) {
      const voice = ctx.createOscillator();
      const gain = ctx.createGain();
      voice.type = multiple === 1 ? 'triangle' : 'sine';
      voice.frequency.setValueAtTime(pitch * multiple, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume * level, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
      voice.connect(gain).connect(effects);
      voice.start(start);
      voice.stop(start + seconds + 0.05);
    }
  }

  function shout() {
    // A different voice every time: from a growl to a squeak.
    const pitch = 0.7 + Math.random() * 0.75;
    if (recording) {
      recording.volume = 1;
      recording.preservesPitch = false;
      recording.playbackRate = pitch;
      recording.currentTime = 0;
      void recording.play().catch(() => undefined);
      return;
    }
    if (!speech) return;
    speech.cancel();
    const line = new SpeechSynthesisUtterance('Bosh!');
    line.rate = 0.8 + Math.random() * 0.5;
    // Speech pitch runs from 0 (lowest) to 2 (highest).
    line.pitch = Math.max(0.05, Math.min(2, (pitch - 0.7) * 2.4));
    // As loud as speech goes: this is the headline act.
    line.volume = 1;
    const voice = speech
      .getVoices()
      .find((candidate) => candidate.lang.startsWith('en'));
    if (voice) line.voice = voice;
    speech.speak(line);
  }

  /** Small random pitch changes stop repeated sounds feeling mechanical. */
  const vary = (spread = 0.08) => 1 + (Math.random() * 2 - 1) * spread;

  /** Drop the music to `depth` of its level, then let it swell back. */
  function dip(depth: number, hold: number) {
    if (!context || !duck) return;
    const now = context.currentTime;
    duck.gain.setTargetAtTime(depth, now, 0.01);
    duck.gain.setTargetAtTime(1, now + hold, 0.3);
  }

  /** A giant hand hitting the desk: a flat slap, a crack and a deep boom. */
  function slam(volume: number) {
    const ctx = audio();
    if (!ctx) return;
    // Heard clearly from anywhere on the desk: it shakes the whole table.
    const loud = Math.max(volume, 0.6) * HAZARD.loudness;
    dip(0.35, 0.3);
    if (!play('slap', { volume: loud, rate: vary(0.06) }))
      play('punch', { volume: loud, rate: 0.55 * vary(0.08) });
    noise(ctx, 0.11, 5200, Math.min(1, 0.7 * loud));
    thump(ctx, Math.min(1, loud));
    play('bang', { volume: 0.7 * loud, rate: 0.36 * vary(0.08) });
    // The desk and everything on it rattles a moment later.
    play('punch', { volume: 0.3 * loud, rate: 0.4, delay: 0.09 });
    play('pop', { volume: 0.25 * loud, rate: 0.6 * vary(0.2), delay: 0.16 });
  }

  function bosh(connected: boolean, volume = 1) {
    if (muted) return;
    const ctx = audio();
    if (ctx) {
      const loud = volume * BOSH.loudness;
      if (connected) {
        dip(0.12, 0.55);
        // The wind-up, the smack, a deep boom underneath, and a slapback.
        play('swish', { volume: loud * 0.6, rate: vary(0.2) });
        if (!play('punch', { volume: loud, rate: vary(0.3) }))
          thump(ctx, 0.9 * volume);
        thump(ctx, Math.min(1, 0.9 * volume));
        play('bang', { volume: loud * 0.45, rate: 0.5 * vary(0.15) });
        play('punch', {
          volume: loud * 0.5,
          rate: 0.7 * vary(0.2),
          delay: 0.13,
        });
        play('punch', {
          volume: loud * 0.25,
          rate: 0.55 * vary(0.2),
          delay: 0.27,
        });
      } else if (!play('swish', { volume: loud * 0.7, rate: vary(0.3) }))
        noise(ctx, 0.22, 900, 0.35 * volume);
    }
    // The announcer calls it when his clips are loaded; otherwise the old
    // spoken "Bosh!" does.
    if (
      !(connected
        ? say('bosh', { priority: 2 })
        : say('miss', { priority: 1 })) &&
      !voices.size
    )
      shout();
  }

  return {
    unlock() {
      const ctx = audio();
      if (ctx) load(ctx);
    },
    get muted() {
      return muted;
    },
    /**
     * 'waiting' until the browser lets audio start (after the first key
     * press or click), then 'on'; 'unsupported' without Web Audio.
     */
    get status(): 'waiting' | 'on' | 'unsupported' {
      if (!context) return unsupported ? 'unsupported' : 'waiting';
      return context.state === 'running' ? 'on' : 'waiting';
    },
    setMuted(value: boolean) {
      muted = value;
      if (muted) speech?.cancel();
      applyVolumes();
    },
    /** Points banked: one bright rising note per point, up to five. */
    say,
    quip,
    chime(points: number) {
      if (muted || points <= 0) return;
      const ctx = audio();
      if (!ctx) return;
      const scale = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      for (let note = 0; note < Math.min(points, scale.length); note++)
        tone(ctx, scale[note]!, note * 0.09, 0.35, 0.28);
    },
    /** The match is won: a short rising fanfare with a held last chord. */
    fanfare() {
      if (muted) return;
      const ctx = audio();
      if (!ctx) return;
      dip(0.25, 1.6);
      [392, 523.25, 659.25, 783.99].forEach((pitch, note) =>
        tone(ctx, pitch, note * 0.14, 0.3, 0.3),
      );
      for (const pitch of [523.25, 659.25, 783.99, 1046.5])
        tone(ctx, pitch, 0.6, 1.4, 0.22);
    },
    /** The Bosh punch: a punch when it connects, a swish when it misses. */
    bosh,
    /** Sounds for a batch of world events, heard from `listener`. */
    playEvents(events: readonly WorldEvent[], listener?: Position) {
      if (muted || !events.length) return;
      const ctx = audio();
      // A gust or punch already covers the knock it causes.
      const covered = events.some(
        (event) =>
          event.type === 'gust' ||
          event.type === 'bosh' ||
          event.type === 'smack',
      );
      for (const event of events) {
        const at =
          'position' in event
            ? event.position
            : 'origin' in event
              ? event.origin
              : undefined;
        const volume = attenuation(listener, at);
        // The announcer reacts to the big moments, and now and then to the
        // small ones.
        if (event.type === 'zap') say('zap', { priority: 2 });
        else if (event.type === 'smack')
          say('smack', { priority: 2, chance: event.moths ? 1 : 0.3 });
        else if (event.type === 'loom') say('hand', { chance: 0.7 });
        else if (event.type === 'explode') say('bang', { chance: 0.6 });
        else if (event.type === 'lamp' && event.zapper) say('zapper');
        else if (event.type === 'dance') say('dance', { chance: 0.15 });
        else if (event.type === 'gust') say('gust', { chance: 0.2 });
        if (event.type === 'bosh') bosh(event.moth !== undefined, volume);
        else if (event.type === 'gust') {
          if (!play('whoosh', { volume, rate: vary() }) && ctx)
            noise(ctx, 0.3, 1200, 0.3 * volume);
        } else if (event.type === 'hit' && !covered) {
          if (!play('punch', { volume: 0.55 * volume, rate: 1.25 }) && ctx)
            thump(ctx, 0.45 * volume);
        } else if (event.type === 'launch') {
          if (event.kind === 'cap') play('pop', { volume, rate: vary(0.15) });
          else play('whoosh', { volume: 0.5 * volume, rate: 0.8 });
        } else if (event.type === 'explode') {
          if (!play('bang', { volume, rate: vary() }) && ctx)
            noise(ctx, 0.5, 600, 0.7 * volume);
        } else if (event.type === 'zap') {
          if (!play('zap', { volume, rate: vary() }) && ctx)
            noise(ctx, 0.25, 4000, 0.5 * volume);
        } else if (event.type === 'loom') {
          // A hand swinging in overhead: a slow, low whoosh.
          play('whoosh', { volume: 0.7 * volume, rate: 0.45 * vary() });
        } else if (event.type === 'smack') {
          slam(volume);
        } else if (event.type === 'dance') {
          play('pop', { volume: 0.7 * volume, rate: vary(0.35) });
        } else if (event.type === 'lamp') {
          play('switch', { volume: 0.8 });
          if (event.zapper) play('zap', { volume: 0.6, rate: 0.7 });
        }
      }
    },
    /** Keep the looping beds in step with the world each frame. */
    update(view: WorldView, listener?: Position) {
      if (!context) return;
      loop('ambience', AUDIO.ambience);
      // The tune always begins at its opening bar.
      loop('music', AUDIO.music, true);
      const zapperVolume = view.lamps.reduce(
        (loudest, lamp) =>
          lamp.zapper
            ? Math.max(loudest, attenuation(listener, lamp))
            : loudest,
        0,
      );
      loop('zapper-hum', zapperVolume * 0.55 * AUDIO.effects);
      const fuseVolume = view.projectiles.reduce(
        (loudest, projectile) =>
          projectile.kind === 'firecracker'
            ? Math.max(loudest, attenuation(listener, projectile))
            : loudest,
        0,
      );
      loop('fuse', fuseVolume * 0.6 * AUDIO.effects);
      const active = view.moths[view.selectedMoth];
      loop('flutter', active?.fluttering ? 0.45 * AUDIO.effects : 0);
      applyVolumes();
    },
    destroy() {
      speech?.cancel();
      loops.clear();
      void context?.close().catch(() => undefined);
      context = undefined;
    },
  };
}
