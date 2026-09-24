import { type Destination, FACTIONS, type Faction, type StatePred } from '../content/types';
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
  /** Standing moved by today's mistakes at the gate (right stamps never move it). */
  readonly standing: Readonly<Partial<Record<Faction, number>>>;
  /**
   * Standing moved by the story since the previous audit: last night's scene, this morning's,
   * today's story souls (and in a vertical slice, its jump). Absent in saves from before it was kept.
   */
  readonly story?: Readonly<Partial<Record<Faction, number>>>;
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
  /** Souls sent to each hall, rightly or not (absent in saves from before M7). */
  readonly sent?: Readonly<Partial<Record<Destination, number>>>;
  /** Souls sent on with nails that should have been cut: Naglfar's progress (absent before M7). */
  readonly naglfar?: number;
  readonly family: readonly FamilyMember[];
  readonly upgrades: readonly string[];
  /** Story memory across days. Integers only (Ink reads them). */
  readonly flags: Readonly<Record<string, number>>;
  readonly ledger: readonly DayLedger[];
  /** Scenes whose effects were applied today; each applies once. */
  readonly scenes: readonly string[];
  /** Rings gained or lost to story effects today, for the night's accounts. */
  readonly storyRings: number;
  /** Standing moved by the story since the last audit; the next audit files it in its ledger. */
  readonly storyStanding?: Readonly<Partial<Record<Faction, number>>>;
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
 * The host at Ragnarök (docs/m7-design.md): worthy einherjar count double, the
 * unworthy (who flee) count against, Freyja's host and Hel's legion count
 * double, and every soul sent on with its nails uncut builds Naglfar. The
 * plan's formula times two, so it stays in whole numbers.
 */
export function ragnarokStrength(run: RunState): number {
  const sent = run.sent ?? {};
  return (
    2 * run.einherjar.worthy -
    run.einherjar.unworthy +
    2 * (sent.FOLKVANGR ?? 0) +
    2 * (sent.HEL ?? 0) -
    2 * (run.naglfar ?? 0)
  );
}

/** A god's standing minus the highest standing of the others: above 0, they lead. */
export function standingLead(run: RunState, faction: Faction): number {
  let best = Number.NEGATIVE_INFINITY;
  for (const [f, n] of Object.entries(run.standing)) if (f !== faction) best = Math.max(best, n);
  return (run.standing[faction] ?? 0) - (best === Number.NEGATIVE_INFINITY ? 0 : best);
}

/**
 * The powers the player has dealings with so far: those whose standing has moved, by a mistake or by
 * the story, on any day, even if it has come back to 0 (or that is off zero, for saves from before
 * story standing was kept). The rest stay out of sight, so a power turns up when the story brings it in.
 */
export function factionsMet(run: RunState): Faction[] {
  const moved = (s: Readonly<Partial<Record<Faction, number>>> | undefined, f: Faction) => s !== undefined && f in s;
  return FACTIONS.filter(
    (f) =>
      run.standing[f] !== 0 ||
      moved(run.storyStanding, f) ||
      run.ledger.some((l) => moved(l.standing, f) || moved(l.story, f)),
  );
}

/**
 * The numbers a StatePred can read:
 * `day`, `rings`, `debtNights`, `standing.<faction>`, `lead.<faction>`,
 * `einherjar.worthy`, `einherjar.unworthy`, `sent.<DESTINATION>`, `naglfar`,
 * `ragnarok`, `flags.<name>`, `family.well`, `family.sick`, `family.home`
 * (not gone) and `family.gone`.
 */
export function stateValue(run: RunState, path: string): number {
  const [head, key] = path.split('.', 2) as [string, string | undefined];
  switch (head) {
    case 'lead':
      return standingLead(run, key as Faction);
    case 'sent':
      return run.sent?.[key as Destination] ?? 0;
    case 'naglfar':
      return run.naglfar ?? 0;
    case 'ragnarok':
      return ragnarokStrength(run);
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
  /^(day|rings|debtNights|naglfar|ragnarok|(standing|lead)\.(odin|freyja|hel|loki|clerk)|einherjar\.(worthy|unworthy)|sent\.(VALHALLA|FOLKVANGR|HEL|RAN|RETURN|DETAIN|TRANSFER)|flags\.[A-Za-z0-9_]+|family\.(well|sick|home|gone))$/;
