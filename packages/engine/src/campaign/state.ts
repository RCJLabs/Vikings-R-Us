import type { Faction, StatePred } from '../content/types';
import type { ShiftState } from '../shift/shift';

/**
 * A campaign run (docs/tech-spec.md §4). Plain JSON, never reads a clock:
 * the day's shift lives inside it while it runs, and everything else is a
 * few numbers, so a morning snapshot is small.
 */

export interface FamilyMember {
  readonly id: string;
  readonly status: 'well' | 'sick' | 'gone';
  /** Nights in a row without the hearth. */
  readonly cold: number;
  /** Nights in a row without food. */
  readonly hungry: number;
  /** Nights in a row sick without medicine. */
  readonly sickNights: number;
  /** How someone who is gone went: adults can die; children are sent to relatives. */
  readonly gone?: 'died' | 'left';
}

export interface Bills {
  readonly hearth: boolean;
  readonly food: boolean;
  /** Family members who get medicine tonight. */
  readonly medicine: readonly string[];
}

/** One day's accounts, shown at the audit and the night. */
export interface DayLedger {
  readonly day: number;
  readonly correct: number;
  readonly wrong: number;
  readonly unjudged: number;
  readonly pay: number;
  readonly bonus: number;
  readonly fines: number;
  readonly standing: Readonly<Partial<Record<Faction, number>>>;
  /** Filled in at the end of the night. */
  readonly night?: {
    readonly hearth: number;
    readonly food: number;
    readonly medicine: number;
    readonly upgrades: number;
    readonly draupnir: number;
    /** Rings gained or lost to story effects today (scenes and story souls). */
    readonly story: number;
    readonly rings: number;
  };
}

export type RunPhase = 'morning' | 'shift' | 'audit' | 'night' | 'ending';

export interface RunState {
  readonly v: 1;
  readonly seed: string;
  readonly genVersion: number;
  readonly day: number;
  readonly phase: RunPhase;
  /** Today's shift, from beginShift through the audit. */
  readonly shift: ShiftState | null;
  readonly rings: number;
  /** Nights in a row that ended below the debt floor. */
  readonly debtNights: number;
  readonly standing: Readonly<Record<Faction, number>>;
  /** Souls stamped VALHALLA who were worthy, and those who weren't (they flee at Ragnarök). */
  readonly einherjar: { readonly worthy: number; readonly unworthy: number };
  readonly family: readonly FamilyMember[];
  readonly upgrades: readonly string[];
  /** Story memory across days. Integers only (Ink reads them). */
  readonly flags: Readonly<Record<string, number>>;
  readonly ledger: readonly DayLedger[];
  /** Scenes whose effects were applied today; each applies once. */
  readonly scenes: readonly string[];
  /** Rings gained or lost to story effects today, for the night's accounts. */
  readonly storyRings: number;
  /** Tonight's bills as the player has set them (night only). */
  readonly bills: Bills | null;
  /** Rings spent in the shop tonight. */
  readonly spent: number;
  readonly ending: string | null;
  /** Story Mode: no sun and no fines. */
  readonly story: boolean;
  /** A vertical-slice run: after the slice's first days it jumps to its late day. */
  readonly slice?: boolean;
}

/**
 * The numbers a StatePred can read:
 * `day`, `rings`, `debtNights`, `standing.<faction>`, `einherjar.worthy`,
 * `einherjar.unworthy`, `flags.<name>`, `family.well`, `family.sick`,
 * `family.home` (not gone) and `family.gone`.
 */
export function stateValue(run: RunState, path: string): number {
  const [head, key] = path.split('.', 2) as [string, string | undefined];
  switch (head) {
    case 'day':
      return run.day;
    case 'rings':
      return run.rings;
    case 'debtNights':
      return run.debtNights;
    case 'standing':
      return run.standing[key as Faction] ?? 0;
    case 'einherjar':
      return key === 'worthy' ? run.einherjar.worthy : run.einherjar.unworthy;
    case 'flags':
      return run.flags[key ?? ''] ?? 0;
    case 'family': {
      if (key === 'home') return run.family.filter((m) => m.status !== 'gone').length;
      return run.family.filter((m) => m.status === key).length;
    }
    default:
      return 0;
  }
}

export function evalState(p: StatePred, run: RunState): boolean {
  if ('all' in p) return p.all.every((q) => evalState(q, run));
  if ('any' in p) return p.any.some((q) => evalState(q, run));
  if ('not' in p) return !evalState(p.not, run);
  const v = stateValue(run, p.state);
  return (
    (p.is === undefined || v === p.is) && (p.gte === undefined || v >= p.gte) && (p.lte === undefined || v <= p.lte)
  );
}

/** Paths a StatePred may use (the content linter checks endings against it). */
export const STATE_PATHS =
  /^(day|rings|debtNights|standing\.(odin|freyja|hel|loki|clerk)|einherjar\.(worthy|unworthy)|flags\.[A-Za-z0-9_]+|family\.(well|sick|home|gone))$/;
