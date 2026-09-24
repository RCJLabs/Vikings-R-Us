import type { ShiftEvent } from '@cots/engine';

/**
 * Placeholder sound (M5). Every effect is synthesised with Web Audio, so
 * there are no files to load or license; the audio pass after the art
 * decision replaces the recipes, and the events that trigger them stay.
 * Sound is best-effort: no AudioContext, a blocked one or a failed node
 * just means silence.
 */

export type Sound =
  | 'stamp'
  | 'send'
  | 'flip'
  | 'inspect'
  | 'feather'
  | 'tool'
  | 'found'
  | 'miss'
  | 'answer'
  | 'citation'
  | 'dusk'
  | 'coins';

/** Which sound a shift event makes, if any. */
export function soundFor(e: ShiftEvent): Sound | null {
  switch (e.e) {
    case 'stamped':
      return 'stamp';
    case 'judged':
      return 'send';
    case 'flipped':
      return 'flip';
    case 'inspected':
      return 'inspect';
    case 'toolUsed':
      return e.tool === 'feather' ? 'feather' : 'tool';
    case 'contradiction':
      return 'found';
    case 'noConflict':
      return 'miss';
    case 'answer':
      return 'answer';
    case 'citation':
      return 'citation';
    case 'dusk':
      return 'dusk';
    case 'done':
      return 'coins';
    default:
      return null;
  }
}

type Ctx = AudioContext;

interface ToneOpts {
  readonly type?: OscillatorType;
  readonly freq: number;
  readonly to?: number;
  readonly dur: number;
  readonly gain: number;
  readonly delay?: number;
  readonly lowpass?: number;
}

function tone(c: Ctx, out: AudioNode, t0: number, o: ToneOpts): void {
  const t = t0 + (o.delay ?? 0);
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(o.gain, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  let node: AudioNode = osc;
  if (o.lowpass) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lowpass;
    node.connect(f);
    node = f;
  }
  node.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.03);
}

interface NoiseOpts {
  readonly filter: BiquadFilterType;
  readonly freq: number;
  readonly to?: number;
  readonly q?: number;
  readonly dur: number;
  readonly gain: number;
}

let noiseBuffer: AudioBuffer | null = null;

/** One second of white noise, made once (a fixed generator: the same hiss every time). */
function noiseOf(c: Ctx): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer;
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 1;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 16807) % 2147483647;
    data[i] = seed / 1073741823.5 - 1;
  }
  noiseBuffer = buf;
  return buf;
}

function noise(c: Ctx, out: AudioNode, t: number, o: NoiseOpts): void {
  const src = c.createBufferSource();
  src.buffer = noiseOf(c);
  const f = c.createBiquadFilter();
  f.type = o.filter;
  f.frequency.setValueAtTime(o.freq, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  f.Q.value = o.q ?? 0.7;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(o.gain, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(env).connect(out);
  src.start(t);
  src.stop(t + o.dur + 0.03);
}

/** The recipes: short, quiet, and distinct from one another. */
const RECIPES: Readonly<Record<Sound, (c: Ctx, out: AudioNode, t: number) => void>> = {
  // A wooden stamp on the table: a low thump with a knock in it.
  stamp: (c, out, t) => {
    tone(c, out, t, { freq: 120, to: 55, dur: 0.2, gain: 0.7 });
    noise(c, out, t, { filter: 'lowpass', freq: 500, dur: 0.07, gain: 0.45 });
  },
  // The writ slid across and away.
  send: (c, out, t) => noise(c, out, t, { filter: 'bandpass', freq: 700, to: 2600, q: 1.2, dur: 0.35, gain: 0.25 }),
  // A body turned over on the bier.
  flip: (c, out, t) => {
    noise(c, out, t, { filter: 'lowpass', freq: 700, to: 300, dur: 0.28, gain: 0.35 });
    tone(c, out, t, { freq: 80, to: 60, dur: 0.18, gain: 0.3 });
  },
  inspect: (c, out, t) => tone(c, out, t, { type: 'triangle', freq: 1300, dur: 0.05, gain: 0.1 }),
  // A breath of air.
  feather: (c, out, t) => noise(c, out, t, { filter: 'highpass', freq: 2500, to: 5000, dur: 0.7, gain: 0.08 }),
  // A tool taken up: a small, dry click.
  tool: (c, out, t) => {
    noise(c, out, t, { filter: 'bandpass', freq: 2400, q: 3, dur: 0.06, gain: 0.3 });
    tone(c, out, t, { type: 'square', freq: 880, dur: 0.035, gain: 0.05 });
  },
  // A lie caught: two rising notes.
  found: (c, out, t) => {
    tone(c, out, t, { freq: 660, dur: 0.14, gain: 0.22 });
    tone(c, out, t, { freq: 990, dur: 0.22, gain: 0.22, delay: 0.1 });
  },
  // Nothing there: a dull buzz.
  miss: (c, out, t) => tone(c, out, t, { type: 'square', freq: 110, dur: 0.25, gain: 0.1, lowpass: 600 }),
  answer: (c, out, t) => tone(c, out, t, { type: 'triangle', freq: 420, to: 520, dur: 0.16, gain: 0.14 }),
  // A mistake: a low horn.
  citation: (c, out, t) => tone(c, out, t, { type: 'sawtooth', freq: 98, dur: 0.55, gain: 0.16, lowpass: 700 }),
  // Dusk: a bell, its partials not quite in tune.
  dusk: (c, out, t) => {
    for (const [ratio, gain, dur] of [
      [1, 0.28, 2.6],
      [2.76, 0.12, 1.8],
      [5.4, 0.06, 1.1],
      [8.93, 0.03, 0.7],
    ] as const) {
      tone(c, out, t, { freq: 392 * ratio, dur, gain });
    }
  },
  // The shift is over: rings counted onto the table.
  coins: (c, out, t) => {
    [2400, 3100, 2700, 3400, 2900].forEach((freq, i) => {
      tone(c, out, t, { freq, dur: 0.16, gain: 0.07, delay: i * 0.07 });
    });
  },
};

let context: Ctx | null = null;
let master: GainNode | null = null;
let volume = 0.6;

type AudioCtor = new () => Ctx;

function audio(): Ctx | null {
  if (volume <= 0) return null;
  if (context) return context;
  const g = globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
    master = context.createGain();
    master.gain.value = volume;
    master.connect(context.destination);
  } catch {
    context = null;
    master = null;
  }
  return context;
}

/** 0 is silent (and creates no audio at all); 1 is full. */
export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = volume;
}

/** Browsers start audio only after a tap or key press: call this from one. */
export function unlockAudio(): void {
  const c = audio();
  if (c?.state === 'suspended') void c.resume().catch(() => undefined);
}

/** Silence while the game is paused or hidden. */
export function holdAudio(held: boolean): void {
  if (!context) return;
  void (held ? context.suspend() : context.resume()).catch(() => undefined);
}

export function play(sound: Sound): void {
  const c = audio();
  if (!c || !master || c.state !== 'running') return;
  try {
    RECIPES[sound](c, master, c.currentTime);
  } catch {
    // Best-effort: a sound that can't play is skipped.
  }
}
