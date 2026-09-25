import { soundOut, whenSoundRuns } from '../audio';
import type { Mix } from './mix';
import type { SoundBook, SoundLayer } from './types';

/*
 * Plays the beds (docs/tech-spec.md §39): whatever mix.ts says, faded to. A new bed fades in as the last one
 * fades out; the music and its tension stem start on the same sample, so they stay in step for as long as they
 * loop; and each level eases toward the mix as it changes. Loops are decoded whole, which is what makes them
 * gapless and in step, and why they're kept short (docs/sound-brief.md).
 */

const LAYERS = ['music', 'tension', 'ambience'] as const;
type LayerName = (typeof LAYERS)[number];

/** A bed fades in over this long, and the one it replaces fades out. */
export const FADE_S = 1.2;
/** How fast a level follows the mix (the time to go about two thirds of the way). */
const EASE_S = 0.25;

/** A layer's decoded sound, in the first format this browser plays; null where it plays none. */
export type Loader = (layer: SoundLayer, ctx: BaseAudioContext) => Promise<AudioBuffer | null>;

interface Voice {
  readonly gain: GainNode;
  source: AudioBufferSourceNode | null;
  target: number;
}

interface Bed {
  readonly id: string;
  readonly voices: Partial<Record<LayerName, Voice>>;
  /** Set once it has been replaced: whatever it was loading is dropped. */
  gone: boolean;
}

/** What is playing, for the dev build's tests: the bed, and each layer's level now and where it's going. */
export interface Heard {
  /** Whether sound is running at all (not before a tap, while paused, or hidden). */
  readonly running: boolean;
  readonly bed: string | null;
  readonly layers: Readonly<
    Partial<Record<LayerName, { readonly level: number; readonly target: number; readonly playing: boolean }>>
  >;
}

export interface BedPlayer {
  apply(mix: Mix): void;
  heard(): Heard;
  stop(): void;
}

export function createBedPlayer(book: () => SoundBook, load: Loader): BedPlayer {
  let wanted: Mix | null = null;
  let current: Bed | null = null;

  const start = (mix: Mix, ctx: AudioContext, out: AudioNode): Bed => {
    const layers = book().beds[mix.bed] ?? {};
    const bed: Bed = { id: mix.bed, voices: {}, gone: false };
    const voices = bed.voices as Partial<Record<LayerName, Voice>>;
    for (const name of LAYERS) {
      if (!layers[name]) continue;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(out);
      voices[name] = { gain, source: null, target: 0 };
    }
    // Everything the bed has, decoded, then started together: the tension stem on the music's own beat.
    void Promise.all(
      LAYERS.map((name) => {
        const layer = layers[name];
        return layer ? load(layer, ctx).catch(() => null) : Promise.resolve(null);
      }),
    ).then((buffers) => {
      if (bed.gone) return;
      const at = ctx.currentTime + 0.05;
      LAYERS.forEach((name, i) => {
        const voice = voices[name];
        const buffer = buffers[i];
        if (!voice || !buffer) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = layers[name]?.loop ?? true;
        source.connect(voice.gain);
        source.start(at);
        voice.source = source;
      });
    });
    return bed;
  };

  const fadeOut = (bed: Bed, ctx: AudioContext) => {
    bed.gone = true;
    const now = ctx.currentTime;
    for (const voice of Object.values(bed.voices)) {
      const g = voice.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + FADE_S);
      if (voice.source) {
        voice.source.onended = () => voice.gain.disconnect();
        voice.source.stop(now + FADE_S + 0.05);
      } else {
        voice.gain.disconnect();
      }
    }
  };

  /** Moves each layer toward the mix: slowly as a bed comes in, quickly after that. */
  const level = (bed: Bed, ctx: AudioContext, mix: Mix, arriving: boolean) => {
    for (const name of LAYERS) {
      const voice = bed.voices[name];
      if (!voice) continue;
      const target = mix[name];
      if (!arriving && Math.abs(target - voice.target) < 0.001) continue;
      voice.target = target;
      voice.gain.gain.setTargetAtTime(target, ctx.currentTime, arriving ? FADE_S / 3 : EASE_S);
    }
  };

  const apply = (mix: Mix) => {
    wanted = mix;
    const out = soundOut();
    // No sound yet (before the first tap, while paused or hidden): the mix is kept for when it runs.
    if (!out) return;
    const arriving = current?.id !== mix.bed;
    if (arriving) {
      if (current) fadeOut(current, out.ctx);
      current = start(mix, out.ctx, out.out);
    }
    if (current) level(current, out.ctx, mix, arriving);
  };

  const stopRuns = whenSoundRuns(() => {
    if (wanted) apply(wanted);
  });

  return {
    apply,
    heard: () => ({
      running: soundOut() !== null,
      bed: current?.id ?? null,
      layers: Object.fromEntries(
        Object.entries(current?.voices ?? {}).map(([name, v]) => [
          name,
          { level: v.gain.gain.value, target: v.target, playing: v.source !== null },
        ]),
      ),
    }),
    stop: () => {
      stopRuns();
      const out = soundOut();
      if (current && out) fadeOut(current, out.ctx);
      current = null;
    },
  };
}

// ---- files ----

const playable = new Map<string, boolean>();

/** Whether this browser says it can play a type (asked once per type). */
function canPlay(type: string): boolean {
  let yes = playable.get(type);
  if (yes === undefined) {
    try {
      yes = typeof Audio !== 'undefined' && new Audio().canPlayType(type) !== '';
    } catch {
      yes = false;
    }
    playable.set(type, yes);
  }
  return yes;
}

/**
 * Decoded files, the most recent last. A decoded minute of stereo is some 23 MB, so only about a bed's worth
 * is kept for coming back to; what's playing holds its own sound whatever this drops.
 */
const decoded = new Map<string, Promise<AudioBuffer | null>>();
const KEEP = 4;

async function fetchDecoded(url: string, ctx: BaseAudioContext): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await ctx.decodeAudioData(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function decode(url: string, ctx: BaseAudioContext): Promise<AudioBuffer | null> {
  let buffer = decoded.get(url);
  if (buffer) decoded.delete(url);
  else buffer = fetchDecoded(url, ctx);
  decoded.set(url, buffer);
  while (decoded.size > KEEP) {
    const oldest = decoded.keys().next().value;
    if (oldest === undefined) break;
    decoded.delete(oldest);
  }
  return buffer;
}

/** Loads a layer from its files: each format the browser plays, in order, until one decodes. */
export const loadFile: Loader = async (layer, ctx) => {
  for (const src of layer.src) {
    if (!canPlay(src.type)) continue;
    const buffer = await decode(src.url, ctx);
    if (buffer) return buffer;
  }
  return null;
};

/**
 * Recorded cues: each cue's variants, decoded once sound first runs, then played in turn. Until they're ready,
 * or where a cue has no files, the synthesised placeholder plays.
 */
export function createCues(
  book: () => SoundBook,
  load: Loader,
): { preload(): void; next(cue: string): AudioBuffer | null } {
  const ready = new Map<string, AudioBuffer[]>();
  const turn = new Map<string, number>();
  let started = false;
  return {
    preload() {
      const out = soundOut();
      if (started || !out) return;
      started = true;
      for (const [cue, variants] of Object.entries(book().cues)) {
        void Promise.all((variants ?? []).map((v) => load(v, out.ctx).catch(() => null))).then((buffers) => {
          const got = buffers.filter((b): b is AudioBuffer => b !== null);
          if (got.length > 0) ready.set(cue, got);
        });
      }
    },
    next(cue) {
      const got = ready.get(cue);
      if (!got) return null;
      const i = turn.get(cue) ?? 0;
      turn.set(cue, i + 1);
      return got[i % got.length] ?? null;
    },
  };
}
