import { z } from 'zod';
import { SOUND_CUES, SOUND_ROLES } from './sound-names';

// ---- Sound (sound.yaml, any pack; docs/sound-brief.md, docs/tech-spec.md §39) ----

/** A sound file's name: `assets/<pack>/sound/<name>.ogg` and `.m4a`. */
const SoundName = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'a lower-case name with hyphens');

/** A layer is a file that loops, or one that plays once (an ending's music). */
const SoundLayerSchema = z.union([SoundName, z.strictObject({ file: SoundName, loop: z.boolean() })]);

/** What some screens play: music, a tension stem that rises with the sun, and ambience; any of them. */
export const SoundBedSchema = z.strictObject({
  id: SoundName,
  /** What it's for, in the sound brief's words. Kept for reading; not built into the game. */
  about: z.string().min(1),
  music: SoundLayerSchema.optional(),
  tension: SoundLayerSchema.optional(),
  ambience: SoundLayerSchema.optional(),
});
export type SoundBedDef = z.infer<typeof SoundBedSchema>;

export const SoundPackSchema = z.strictObject({
  beds: z.array(SoundBedSchema).optional(),
  /** A day's own beds for some places (Day 20's gate). */
  days: z
    .array(z.strictObject({ day: z.number().int().min(1), beds: z.partialRecord(z.enum(SOUND_ROLES), SoundName) }))
    .optional(),
  /** An ending's own music. */
  endings: z.array(z.strictObject({ ending: z.string().min(1), bed: SoundName })).optional(),
  /** Files for a cue, played in turn; a cue without files keeps its synthesised placeholder. */
  cues: z.partialRecord(z.enum(SOUND_CUES), z.array(SoundName).min(1)).optional(),
});
export type SoundPack = z.infer<typeof SoundPackSchema>;
