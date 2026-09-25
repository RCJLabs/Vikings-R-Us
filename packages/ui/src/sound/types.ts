import type { Sound } from '../audio';
import type { Role } from './mix';

/* The sound a build ships (the generated `sound` module; docs/tech-spec.md §39). Only files that exist are in it. */

export interface SoundSource {
  readonly url: string;
  /** Its MIME type with codecs, for asking the browser whether it can play it. */
  readonly type: string;
}

export interface SoundLayer {
  readonly loop: boolean;
  /** The same sound in each format there is, first choice first. */
  readonly src: readonly SoundSource[];
}

export interface SoundBed {
  readonly music?: SoundLayer;
  readonly tension?: SoundLayer;
  readonly ambience?: SoundLayer;
}

export interface SoundBook {
  readonly beds: Readonly<Record<string, SoundBed>>;
  readonly days: Readonly<Record<number, Readonly<Partial<Record<Role, string>>>>>;
  readonly endings: Readonly<Record<string, string>>;
  /** Recorded variants for a cue, played in turn; a cue that isn't here keeps its synthesised placeholder. */
  readonly cues: Readonly<Partial<Record<Sound, readonly SoundLayer[]>>>;
}
