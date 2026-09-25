/*
 * What should be heard, and how loud (docs/tech-spec.md §39): a pure function of where the player is, so it
 * can be tested without a speaker. Each screen has a bed (its music and ambience) by the place it stands for;
 * the gate's tension layer rises as the sun sinks; the music and ambience drop while story text is on
 * screen. The player (beds.ts) fades toward whatever this says.
 */

import type { Screen } from '../store';

/** The places the sound follows. Several screens share one: the menus share the title's, results the tally's. */
export type Role = 'title' | 'gate' | 'morning' | 'tally' | 'night' | 'ending';

export const ROLES: readonly Role[] = ['title', 'gate', 'morning', 'tally', 'night', 'ending'];

export const ROLE_OF: Readonly<Record<Screen, Role>> = {
  title: 'title',
  campaign: 'title',
  briefing: 'title',
  shift: 'gate',
  summary: 'tally',
  endless: 'tally',
  audit: 'tally',
  morning: 'morning',
  night: 'night',
  ending: 'ending',
};

/** Which bed a place has, where the content gives one of its own: a day's (Ragnarök's gate), an ending's. */
export interface BedChoices {
  readonly days: Readonly<Record<number, Readonly<Partial<Record<Role, string>>>>>;
  readonly endings: Readonly<Record<string, string>>;
}

export interface Place {
  readonly screen: Screen;
  /** The campaign's day, or null outside the campaign. */
  readonly day: number | null;
  /** The ending reached, on the ending screen. */
  readonly ending: string | null;
}

/** The bed for a place: an ending's own, else the day's own for that role, else the role's. */
export function bedFor(place: Place, choices: BedChoices): string {
  const role = ROLE_OF[place.screen];
  const ending = role === 'ending' && place.ending ? choices.endings[place.ending] : undefined;
  if (ending) return ending;
  const day = place.day === null ? undefined : choices.days[place.day]?.[role];
  return day ?? role;
}

/** The tension layer is silent for the first half of the sun. */
export const TENSION_FROM = 0.5;
/** How much the calm music gives way to the tension layer at dusk. */
export const CALM_UNDER_TENSION = 0.35;
/** How far each part drops under story text: music to 0.4 (about -8 dB), ambience to 0.55 (about -5 dB). */
export const STORY_DUCK = { music: 0.4, ambience: 0.55 } as const;

/**
 * How far the tension layer has risen, 0 to 1, from the share of the sun used (1 at dusk, and after it):
 * nothing until half the sun is gone, then an S-curve up to full at dusk. Null (no sun: Story Mode, untimed
 * practice, Endless) is none.
 */
export function tensionFor(sunUsed: number | null): number {
  if (sunUsed === null) return 0;
  const x = Math.min(1, Math.max(0, (sunUsed - TENSION_FROM) / (1 - TENSION_FROM)));
  return x * x * (3 - 2 * x);
}

export interface MixInput extends Place {
  /** The share of the sun used in the shift on screen (0 at dawn, 1 at dusk), or null when there's no sun. */
  readonly sunUsed: number | null;
  /** Story text is on screen: a scene, an ending. */
  readonly story: boolean;
}

/** The player's volumes for each part, 0 to 1 (the effects and the whole are set elsewhere). */
export interface Levels {
  readonly music: number;
  readonly ambience: number;
}

export interface Mix {
  readonly bed: string;
  /** Each layer's level, 0 to 1. The tension layer follows the music's volume. */
  readonly music: number;
  readonly tension: number;
  readonly ambience: number;
}

export function mixFor(input: MixInput, choices: BedChoices, levels: Levels): Mix {
  const tension = tensionFor(input.sunUsed);
  const music = levels.music * (input.story ? STORY_DUCK.music : 1);
  return {
    bed: bedFor(input, choices),
    music: music * (1 - CALM_UNDER_TENSION * tension),
    tension: music * tension,
    ambience: levels.ambience * (input.story ? STORY_DUCK.ambience : 1),
  };
}
