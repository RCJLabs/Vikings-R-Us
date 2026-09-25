/*
 * The names the sound's content can use (docs/tech-spec.md §39). Plain data with no dependencies, so the UI's
 * tests can check their own lists against it: packages/ui/src/sound/mix.ts has the roles, and
 * packages/ui/src/audio.ts the cues.
 */

/** The places the sound follows: each is also the id of the bed those screens play by default. */
export const SOUND_ROLES = ['title', 'gate', 'morning', 'tally', 'night', 'ending'] as const;
export type SoundRole = (typeof SOUND_ROLES)[number];

/** The game's sound cues: a synthesised placeholder each, until files are named for it. */
export const SOUND_CUES = [
  'stamp',
  'send',
  'flip',
  'inspect',
  'feather',
  'tool',
  'found',
  'miss',
  'answer',
  'citation',
  'dusk',
  'coins',
] as const;
export type SoundCue = (typeof SOUND_CUES)[number];

/**
 * The files a sound can come as, by extension, first choice first: Opus loops without a gap wherever it
 * plays, and AAC covers Safari before 18.4 (docs/sound-brief.md).
 */
export const SOUND_TYPES = {
  ogg: 'audio/ogg; codecs=opus',
  m4a: 'audio/mp4; codecs="mp4a.40.2"',
} as const;
