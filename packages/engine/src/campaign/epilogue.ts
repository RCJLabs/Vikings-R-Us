import type { CampaignDef, EpilogueSection } from '../content/types';
import { evalState, type RunState } from './state';

/*
 * The epilogue (docs/tech-spec.md §55). After the ending's own words, what became of everyone: the family, the powers,
 * the souls the story put at the gate. Each is a slot in the content, and says the first of its lines whose condition
 * the finished run meets; the conditions read the run the way the endings do (flags, standing, the family, the
 * battle), and the ending it came to.
 */

export interface EpilogueLine {
  readonly slot: string;
  readonly section: EpilogueSection;
  /** A string key. */
  readonly text: string;
}

/** What the epilogue says of a finished run, in the content's order; nothing before the run has ended. */
export function epilogueFor(run: RunState, campaign: CampaignDef | undefined): EpilogueLine[] {
  const def = campaign?.epilogue;
  if (!def || run.ending === null) return [];
  if (def.when && !evalState(def.when, run)) return [];
  const out: EpilogueLine[] = [];
  for (const s of def.slots) {
    if (s.when && !evalState(s.when, run)) continue;
    const line = s.lines.find((l) => !l.when || evalState(l.when, run));
    if (line) out.push({ slot: s.id, section: s.section, text: line.text });
  }
  return out;
}

/** The numbers an epilogue's words may use: the rings left, the day, the fronts held and the souls who ran. */
export function epilogueParams(run: RunState): Readonly<Record<string, number>> {
  const fronts = run.battle?.fronts ?? [];
  return {
    rings: run.rings,
    day: run.day,
    fronts: fronts.filter((f) => f.held).length,
    ran: fronts.reduce((n, f) => n + f.ran, 0),
  };
}
