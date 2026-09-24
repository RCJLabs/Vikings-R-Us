import type { Content } from '../content/types';
import { generateDay } from '../gen/generate';
import type { CaseSpec } from '../gen/types';
import { createDayContext } from '../logic/context';

/*
 * Endless (docs/m7-design.md): the days' rules in order, a round of five souls
 * on each, then the last day's rules for as long as the player lasts. Three
 * wrong stamps end it; the score is the souls judged rightly. No sun, and no
 * new content: each round is its day's queue, cut short.
 */

export const ENDLESS_SOULS = 5;
export const ENDLESS_STRIKES = 3;

/** The day whose rules round `round` (from 0) is played on. */
export function endlessDay(content: Content, round: number): number {
  const days = content.days.map((d) => d.day).sort((a, b) => a - b);
  const day = days[Math.min(Math.max(0, round), days.length - 1)];
  if (day === undefined) throw new Error('This build has no days to play');
  return day;
}

export interface EndlessRound {
  readonly day: number;
  /** The round's own seed: a shift started with it (mode practice) gets the same day context. */
  readonly seed: string;
  /** The first souls of the day's queue, so a day's teaching soul (its new rule) comes first. */
  readonly cases: readonly CaseSpec[];
}

export function endlessRound(content: Content, seed: string, round: number): EndlessRound {
  const day = endlessDay(content, round);
  const roundSeed = `${seed}|endless|${round}`;
  const ctx = createDayContext(content, day, roundSeed);
  return { day, seed: roundSeed, cases: generateDay(roundSeed, ctx).cases.slice(0, ENDLESS_SOULS) };
}
