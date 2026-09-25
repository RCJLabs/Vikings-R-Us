import type { SoundBook, SoundLayer } from './types';

/*
 * Sketches for the dev build only (`?sound=sketch`, docs/tech-spec.md §39): a drone for each place's music, a
 * pulse for the gate's tension, wind and a hearth for ambience, all made in code. They let the beds, the tension
 * and the ducking be heard and tested before any real sound exists. They are not placeholders to ship: only
 * dev-full can load this module, and the brief says why silence beats a placeholder loop.
 */

/** Every sketch loops over the same length, so the music and its tension stem stay in step. */
const LOOP_S = 8;
const TAU = Math.PI * 2;

const layer = (name: string, loop = true): SoundLayer => ({ loop, src: [{ url: `sketch:${name}`, type: 'sketch' }] });

export const sketchBook: SoundBook = {
  beds: {
    title: { music: layer('title') },
    gate: { music: layer('gate'), tension: layer('gate-tension'), ambience: layer('wind') },
    morning: { music: layer('morning'), ambience: layer('breeze') },
    tally: { music: layer('tally') },
    night: { music: layer('night'), ambience: layer('hearth') },
    ending: { music: layer('ending', false) },
  },
  days: {},
  endings: {},
  cues: {},
};

export const isSketch = (l: SoundLayer): boolean => l.src[0]?.type === 'sketch';

/** A frequency moved to the nearest that fits whole cycles into the loop, so it joins without a click. */
const fit = (hz: number) => Math.round(hz * LOOP_S) / LOOP_S;

/** A chord of sines, fitted to the loop, swelling once a loop. */
const pad =
  (notes: readonly number[], swell = 0.3) =>
  (t: number): number => {
    const s = notes.reduce((sum, hz) => sum + Math.sin(TAU * fit(hz) * t), 0);
    return s * (1 - swell + swell * Math.sin((TAU * t) / LOOP_S));
  };

/** A fixed noise source: the same hiss every time. */
function noise(n: number): Float32Array {
  const out = new Float32Array(n);
  let seed = 7;
  for (let i = 0; i < n; i++) {
    seed = (seed * 16807) % 2147483647;
    out[i] = seed / 1073741823.5 - 1;
  }
  return out;
}

/** Filtered noise that loops: one pole of low-pass, and the tail cross-faded into the head. */
function looped(n: number, rate: number, cutoff: number, sparks = 0): Float32Array {
  const fade = Math.round(rate * 0.5);
  const raw = noise(n + fade);
  const a = 1 - Math.exp((-TAU * cutoff) / rate);
  let y = 0;
  for (let i = 0; i < raw.length; i++) {
    y += a * ((raw[i] ?? 0) - y);
    raw[i] = y;
  }
  // A hearth's crackle: sparse, sharp clicks on the rumble.
  if (sparks > 0) {
    let seed = 11;
    for (let k = 0; k < sparks; k++) {
      seed = (seed * 16807) % 2147483647;
      const at = seed % n;
      for (let j = 0; j < 90 && at + j < raw.length; j++)
        raw[at + j] = (raw[at + j] ?? 0) + (j % 2 ? -1 : 1) * Math.exp(-j / 12) * 0.6;
    }
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const tail = i < fade ? (raw[n + i] ?? 0) * (1 - i / fade) : 0;
    out[i] = (raw[i] ?? 0) * (i < fade ? i / fade : 1) + tail;
  }
  return out;
}

type Fill = (ctx: BaseAudioContext, n: number) => Float32Array;
const fromTime =
  (f: (t: number) => number): Fill =>
  (ctx, n) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = f(i / ctx.sampleRate);
    return out;
  };

const MAKERS: Readonly<Record<string, Fill>> = {
  // A minor, slow.
  title: fromTime(pad([110, 164.81, 220, 261.63])),
  // A low open fifth on D.
  gate: fromTime(pad([73.42, 110, 146.83], 0.2)),
  // A heartbeat at 90 a minute: twelve beats a loop, low.
  'gate-tension': fromTime((t) => {
    const beat = t % (60 / 90);
    const thud = Math.exp(-beat * 9) + 0.6 * Math.exp(-Math.max(0, beat - 0.18) * 14) * (beat > 0.18 ? 1 : 0);
    return thud * (Math.sin(TAU * fit(55) * t) + 0.5 * Math.sin(TAU * fit(110) * t));
  }),
  wind: (ctx, n) => {
    const w = looped(n, ctx.sampleRate, 500);
    for (let i = 0; i < n; i++) w[i] = (w[i] ?? 0) * (0.55 + 0.45 * Math.sin((TAU * i) / n));
    return w;
  },
  // D major, high and quiet.
  morning: fromTime(pad([293.66, 369.99, 440])),
  breeze: (ctx, n) => looped(n, ctx.sampleRate, 1200),
  // Two notes plucked in turn, twice a second.
  tally: fromTime((t) => {
    const k = Math.floor(t / 0.5);
    const hz = k % 2 === 0 ? 392 : 587.33;
    return Math.exp(-(t % 0.5) * 7) * Math.sin(TAU * fit(hz) * t);
  }),
  // F major, low and warm.
  night: fromTime(pad([87.31, 130.81, 174.61, 220], 0.25)),
  hearth: (ctx, n) => looped(n, ctx.sampleRate, 250, 40),
  // Once, dying away.
  ending: fromTime((t) => pad([98, 146.83, 196, 246.94], 0)(t) * Math.exp(-t * 0.45)),
};

/** A sketch, made for this context: eight seconds, its loudest sample at a quarter of full scale. */
export function loadSketch(l: SoundLayer, ctx: BaseAudioContext): Promise<AudioBuffer | null> {
  const make = MAKERS[l.src[0]?.url.slice('sketch:'.length) ?? ''];
  if (!make) return Promise.resolve(null);
  const n = Math.round(LOOP_S * ctx.sampleRate);
  const data = make(ctx, n);
  let peak = 0;
  for (const x of data) peak = Math.max(peak, Math.abs(x));
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const out = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) out[i] = peak > 0 ? ((data[i] ?? 0) / peak) * 0.25 : 0;
  return Promise.resolve(buffer);
}
