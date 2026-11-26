import { AUDIO, BOSH, HAZARD } from '../config';
import type { Position, WorldEvent, WorldView } from '../game/world';

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
  'title',
] as const;
/** The two tunes: one for the title screen, one for a match. */
const TUNES = ['title', 'music'] as const;
type Tune = (typeof TUNES)[number];
const isTune = (name: string): name is Tune =>
  (TUNES as readonly string[]).includes(name);
export type SampleName = (typeof SAMPLES)[number];
const samplePath = (name: SampleName) =>
  `sounds/artlist/${name}.${isTune(name) ? 'mp3' : 'aac'}`;

/**
 * The announcer: short spoken lines for the big moments, generated with an
 * Artlist voice and loaded from `public/sounds/artlist/voice/` when present.
 * Each cue has one or more takes; one is picked at random.
 */
export const VOICE_LINES = {
  start: ['start-1', 'start-2'],
  ready: ['ready'],
  flutter: ['flutter'],
  fight: ['fight'],
  round1: ['round-1'],
  round2: ['round-2'],
  round3: ['round-3'],
  round: ['round-next'],
  turn0: ['turn-0'],
  turn1: ['turn-1'],
  turn2: ['turn-2'],
  turn3: ['turn-3'],
  bosh: ['bosh-1', 'bosh-2', 'bosh-3'],
  miss: ['miss'],
  zap: ['zap-1', 'zap-2', 'zap-3'],
  zapper: ['zapper'],
  hand: ['hand-1', 'hand-2'],
  smack: ['smack-1', 'smack-2'],
  hot: ['hot'],
  burn: ['burn-1', 'burn-2', 'burn-3'],
  bank: ['bank-1', 'bank-2'],
  fall: ['fall-1', 'fall-2'],
  bang: ['bang'],
  dance: ['dance'],
  gust: ['gust'],
  matchpoint: ['matchpoint'],
  win0: ['win-0'],
  win1: ['win-1'],
  win2: ['win-2'],
  win3: ['win-3'],
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
/**
 * The giants grumble as they swat: three voices, one per person round the
 * desk, with three lines for the slam and one for the wind-up.
 */
export const GIANT_VOICES = 3;
/** Slam lines each giant has; the third has a longer, sillier list. */
const GIANT_SLAMS = [3, 3, 10];
/** Lines each giant has for being taken over by a Mind Control. */
const GIANT_MINDS = 3;
const giantTakes = (person: number, cue: 'slam' | 'loom' | 'mind') => {
  const voice = person % GIANT_VOICES;
  if (cue === 'mind')
    return Array.from(
      { length: GIANT_MINDS },
      (_, take) => `giant/${voice}-mind-${take + 1}`,
    );
  return cue === 'slam'
    ? Array.from(
        { length: GIANT_SLAMS[voice] ?? 3 },
        (_, take) => `giant/${voice}-slam-${take + 1}`,
      )
    : [`giant/${voice}-loom-1`];
};
/** How long a clip is really talking, ignoring a quiet tail of reverb. */
function spokenSeconds(buffer: AudioBuffer) {
  if (typeof buffer.getChannelData !== 'function') return buffer.duration;
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++)
    peak = Math.max(peak, Math.abs(data[i]!));
  let last = data.length - 1;
  while (last > 0 && Math.abs(data[last]!) < peak * 0.12) last--;
  return Math.min(buffer.duration, (last + 1) / buffer.sampleRate + 0.15);
}
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
  loadSample = fetchSample,
  // A caller that supplies its own samples gets no announcer unless it
  // supplies those clips too.
  loadVoice = loadSample === fetchSample ? fetchVoice : async () => undefined,
  random = Math.random,
}: Dependencies = {}) {
  const voices = new Map<string, AudioBuffer>();
  const voiceMakeup = new Map<string, number>();
  const voiceLength = new Map<string, number>();
  /** Whoever is swinging the hand, for picking the giant's voice. */
  let giantPerson = 0;
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
  // Music and everything else (effects, voices, room tone) switch separately.
  let musicOn = true;
  /** Which tune is wanted: the title screen's until a match begins. */
  let tune: Tune = 'title';
  /** Fade the unwanted tune out and bring the wanted one in from its start. */
  const playTune = () => {
    for (const each of TUNES)
      loop(each, each === tune && musicOn ? AUDIO.music : 0, true);
  };
  let effectsOn = true;
  let loading = false;
  let unsupported = false;
  const buffers = new Map<SampleName, AudioBuffer>();
  const makeup = new Map<SampleName, number>();
  const loops = new Map<
    SampleName,
    { source: AudioBufferSourceNode; gain: GainNode }
  >();

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
    const master = AUDIO.master;
    // Only reschedule the mix when a setting actually changed.
    const key = `${master}:${AUDIO.effects}:${effectsOn}:${musicOn}`;
    if (key === appliedVolumes) return;
    appliedVolumes = key;
    effects.gain.setTargetAtTime(
      effectsOn ? master * AUDIO.effects : 0,
      context.currentTime,
      0.05,
    );
    // The looping beds are switched one by one, in `update`.
    beds.gain.setTargetAtTime(
      effectsOn || musicOn ? master : 0,
      context.currentTime,
      0.2,
    );
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
    const giantFiles = Array.from({ length: GIANT_VOICES }, (_, person) => [
      ...giantTakes(person, 'slam'),
      ...giantTakes(person, 'loom'),
      ...giantTakes(person, 'mind'),
    ]).flat();
    for (const file of [
      ...Object.values(VOICE_LINES).flat(),
      ...mothFiles,
      ...giantFiles,
    ])
      void loadVoice(ctx, file).then((buffer) => {
        if (!buffer) return;
        voiceMakeup.set(file, normalisingGain(buffer));
        voiceLength.set(file, spokenSeconds(buffer));
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
    {
      priority = 1,
      chance = 1,
      delay = 0,
      boost = 1,
    }: {
      priority?: number;
      chance?: number;
      /** Seconds to hold the line back, to let a loud effect land first. */
      delay?: number;
      /** How much louder than usual to say it. */
      boost?: number;
    } = {},
  ) {
    const ctx = context;
    if (!ctx || !effects || !effectsOn) return undefined;
    const takes = files.filter((file) => voices.has(file));
    if (!takes.length) return false;
    const now = ctx.currentTime;
    const busy = !!speaking && now < speaking.until;
    const outranks = !busy || priority > speaking!.priority;
    const wait = (busy && !outranks ? speaking!.until - now : 0) + delay;
    if (!outranks && (priority < 2 || wait - delay > 2)) return undefined;
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
    gain.gain.value = volume * boost * (voiceMakeup.get(file) ?? 1);
    source.connect(gain).connect(effects);
    source.start(now + wait);
    lastTake.set(key, file);
    const length = voiceLength.get(file) ?? buffer.duration;
    speaking = {
      sources: busy && !outranks ? [...speaking!.sources, source] : [source],
      until: now + wait + length + 0.2,
      priority: busy && !outranks ? speaking!.priority : priority,
    };
    // The music steps back while anyone is talking.
    dip(0.4, wait + length);
    return true;
  }

  /** Have the announcer speak a line. `chance` makes common cues occasional. */
  function say(
    cue: VoiceCue,
    options: {
      priority?: number;
      chance?: number;
      delay?: number;
      boost?: number;
    } = {},
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
    if (!ctx || !effects || !buffer || !effectsOn) return false;
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
    if (!effectsOn) return;
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
    // spoken "Bosh!" does. A punch is over in an instant, so his call cuts
    // across whatever a moth is saying rather than queueing behind it.
    if (
      !(connected
        ? // Held back until the punch and its boom have landed, and said
          // louder, so the effect does not bury him.
          say('bosh', { priority: 3, delay: 0.55, boost: 1.5 })
        : say('miss', { priority: 3, delay: 0.25 })) &&
      !voices.size
    )
      shout();
  }

  return {
    unlock() {
      const ctx = audio();
      if (ctx) load(ctx);
    },
    /** True when both the music and the sound effects are off. */
    get muted() {
      return !musicOn && !effectsOn;
    },
    get music() {
      return musicOn;
    },
    get effects() {
      return effectsOn;
    },
    /** Switch the background music on or off. */
    setMusic(on: boolean) {
      musicOn = on;
      if (!on) for (const each of TUNES) loop(each, 0);
      applyVolumes();
    },
    /** Switch effects, voices and room tone on or off. */
    setEffects(on: boolean) {
      effectsOn = on;
      if (!on) {
        speech?.cancel();
        for (const name of [...loops.keys()]) if (!isTune(name)) loop(name, 0);
      }
      applyVolumes();
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
      musicOn = effectsOn = !value;
      if (value) {
        speech?.cancel();
        for (const name of [...loops.keys()]) loop(name, 0);
      }
      applyVolumes();
    },
    /** Points banked: one bright rising note per point, up to five. */
    say,
    quip,
    /** One tick of the countdown before a hand lands; the last is higher. */
    count(left: number) {
      if (!effectsOn) return;
      const ctx = audio();
      if (ctx) tone(ctx, left <= 1 ? 880 : 587.33, 0, 0.22, 0.4);
    },
    chime(points: number) {
      if (!effectsOn || points <= 0) return;
      const ctx = audio();
      if (!ctx) return;
      const scale = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      for (let note = 0; note < Math.min(points, scale.length); note++)
        tone(ctx, scale[note]!, note * 0.09, 0.35, 0.28);
    },
    /** The match is won: a short rising fanfare with a held last chord. */
    fanfare() {
      if (!effectsOn) return;
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
      if (!effectsOn || !events.length) return;
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
        if (event.type === 'mind') {
          // The spell crackles out, then the giant says what it feels like.
          play('zap', { volume: 0.5 * volume, rate: 0.55 });
          play('whoosh', { volume: 0.7 * volume, rate: 0.7, delay: 0.1 });
          speak(
            giantTakes(event.person, 'mind'),
            `giant-${event.person % GIANT_VOICES}-mind`,
            AUDIO.giantVoice,
            { priority: 3, delay: 0.45 },
          );
        }
        if (event.type === 'zap') say('zap', { priority: 2 });
        else if (event.type === 'smack') {
          // The giant has the first word, then the announcer.
          speak(
            giantTakes(giantPerson, 'slam'),
            `giant-${giantPerson % GIANT_VOICES}-slam`,
            AUDIO.giantVoice,
            { priority: 3 },
          );
          say('smack', { priority: 2, chance: event.moths ? 1 : 0.3 });
        } else if (event.type === 'loom') {
          if (
            speak(
              giantTakes(giantPerson, 'loom'),
              `giant-${giantPerson % GIANT_VOICES}-loom`,
              AUDIO.giantVoice,
              { priority: 2, chance: 0.5 },
            ) !== true
          )
            say('hand', { chance: 0.7 });
        } else if (event.type === 'explode') say('bang', { chance: 0.6 });
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
    /**
     * The title screen: its own tune plays, and the match's beds fall
     * silent. Call each frame while no match is being played.
     */
    idle() {
      if (!context) return;
      tune = 'title';
      playTune();
      for (const name of [...loops.keys()]) if (!isTune(name)) loop(name, 0);
    },
    /** Keep the looping beds in step with the world each frame. */
    update(view: WorldView, listener?: Position) {
      if (!context) return;
      giantPerson = view.hazards?.[0]?.person ?? giantPerson;
      // With the effects off every bed but the music falls silent.
      const sound = effectsOn ? 1 : 0;
      loop('ambience', AUDIO.ambience * sound);
      // A match has its own tune, which always begins at its opening bar.
      tune = 'music';
      playTune();
      const zapperVolume = view.lamps.reduce(
        (loudest, lamp) =>
          lamp.zapper
            ? Math.max(loudest, attenuation(listener, lamp))
            : loudest,
        0,
      );
      loop('zapper-hum', zapperVolume * 0.55 * AUDIO.effects * sound);
      const fuseVolume = view.projectiles.reduce(
        (loudest, projectile) =>
          projectile.kind === 'firecracker'
            ? Math.max(loudest, attenuation(listener, projectile))
            : loudest,
        0,
      );
      loop('fuse', fuseVolume * 0.6 * AUDIO.effects * sound);
      const active = view.moths[view.selectedMoth];
      loop('flutter', active?.fluttering ? 0.45 * AUDIO.effects * sound : 0);
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
