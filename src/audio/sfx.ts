/** Optional recording: drop a file here to replace the spoken "Bosh!". */
export const BOSH_RECORDING = 'sounds/bosh.mp3';

type Dependencies = {
  createContext?: () => AudioContext | undefined;
  speech?: SpeechSynthesis | undefined;
  /** Resolves to a playable recording URL, or undefined when there is none. */
  findRecording?: () => Promise<string | undefined>;
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

/**
 * Small synthesised sound effects. Browsers only allow audio after a user
 * gesture, so call `unlock()` from the first key press or click.
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
}: Dependencies = {}) {
  let context: AudioContext | undefined;
  let muted = false;
  let recording: HTMLAudioElement | undefined;
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
    }
    if (context?.state === 'suspended') void context.resume();
    return context;
  }

  /** A falling sine "thud" with a burst of noise for the knuckles. */
  function thump(ctx: AudioContext) {
    const now = ctx.currentTime;
    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(150, now);
    body.frequency.exponentialRampToValueAtTime(42, now + 0.22);
    bodyGain.gain.setValueAtTime(0.9, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    body.connect(bodyGain).connect(ctx.destination);
    body.start(now);
    body.stop(now + 0.32);
    noise(ctx, 0.08, 1800, 0.5);
  }

  /** Filtered noise: a short crack, or a longer whoosh for a miss. */
  function noise(
    ctx: AudioContext,
    seconds: number,
    frequency: number,
    volume: number,
  ) {
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
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(now);
  }

  function shout() {
    if (recording) {
      recording.currentTime = 0;
      void recording.play().catch(() => undefined);
      return;
    }
    if (!speech) return;
    speech.cancel();
    const line = new SpeechSynthesisUtterance('Bosh!');
    line.rate = 0.95;
    line.pitch = 0.55;
    line.volume = 1;
    const voice = speech
      .getVoices()
      .find((candidate) => candidate.lang.startsWith('en'));
    if (voice) line.voice = voice;
    speech.speak(line);
  }

  return {
    unlock() {
      audio();
    },
    get muted() {
      return muted;
    },
    setMuted(value: boolean) {
      muted = value;
      if (muted) speech?.cancel();
    },
    /** The Bosh punch: a thump when it connects, a whoosh when it misses. */
    bosh(connected: boolean) {
      if (muted) return;
      const ctx = audio();
      if (ctx) {
        if (connected) thump(ctx);
        else noise(ctx, 0.22, 900, 0.35);
      }
      shout();
    },
    destroy() {
      speech?.cancel();
      void context?.close().catch(() => undefined);
      context = undefined;
    },
  };
}
