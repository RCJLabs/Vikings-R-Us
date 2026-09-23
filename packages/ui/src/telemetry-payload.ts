import {
  type CaseSpec,
  type DayCtx,
  type Destination,
  type Field,
  type GuardResult,
  type ShiftAction,
  type ShiftState,
  type SoulTrace,
  shiftScore,
  type ToolId,
  traceShift,
} from '@cots/engine';

/*
 * The opt-in alpha telemetry record for one finished shift (docs/privacy.md).
 * Built from the action log, so it says what the player did, per soul: the
 * rule that applied, what they stamped, how long it took, the tools used and
 * which kinds of sign they looked at or missed. No ids, no names, no free text.
 * Kept free of browser and content-bundle imports so the telemetry Worker's
 * tests can validate real records against its schema.
 */

export interface BuildInfo {
  readonly target: string;
  readonly content: string;
  readonly g: number;
}

export interface SoulRecord {
  readonly i: number;
  readonly arch: string;
  readonly rule: string;
  readonly expected: Destination;
  readonly stamped: Destination | null;
  readonly correct: boolean;
  readonly sunMs: number;
  readonly penaltyMs: number;
  readonly flipped: boolean;
  readonly tools: readonly ToolId[];
  /** Kinds of evidence looked at: sign keys (grip, skin, …) or testimony / huginn / muninn. */
  readonly looked: readonly string[];
  /** Kinds of evidence in the minimal proof that were never looked at. */
  readonly missed: readonly string[];
  readonly lies: number;
  readonly caught: number;
  readonly questioned: number;
  readonly badCompares: number;
  readonly difficulty: number;
  readonly proofCostS: number;
}

export interface ShiftRecord {
  readonly v: 1;
  readonly build: BuildInfo;
  readonly mode: 'daily' | 'practice' | 'primer';
  /** Daily number (dailies only). */
  readonly n?: number;
  readonly day: number;
  readonly layout: 'desk' | 'drawer';
  readonly untimed: boolean;
  readonly sunMs: number;
  readonly endedBy: 'queue' | 'dusk';
  readonly guard: GuardResult;
  readonly correct: number;
  readonly total: number;
  readonly spareMs: number;
  readonly souls: readonly SoulRecord[];
}

export interface ShiftRecordInput {
  readonly build: BuildInfo;
  readonly mode: ShiftRecord['mode'];
  readonly n?: number;
  readonly layout: ShiftRecord['layout'];
  readonly guard?: GuardResult;
  readonly initial: ShiftState;
  readonly actions: readonly ShiftAction[];
  readonly ctx: DayCtx;
}

/** The kind of evidence a field is, without its value. */
const kindOf = (f: Field): string => f.obs?.key ?? f.cue?.key ?? f.item;

function soulRecord(c: CaseSpec, t: SoulTrace): SoulRecord {
  const byId = new Map(c.evidence.fields.map((f) => [f.id, f]));
  const kinds = (ids: readonly string[]) => [
    ...new Set(ids.flatMap((id) => (byId.has(id) ? [kindOf(byId.get(id) as Field)] : []))),
  ];
  return {
    i: t.index,
    arch: c.archetype,
    rule: c.expect.rule,
    expected: c.expect.dest,
    stamped: t.verdict?.stamped ?? null,
    correct: t.verdict?.correct ?? false,
    sunMs: t.sunMs,
    penaltyMs: t.penaltyMs,
    flipped: t.flipped,
    tools: [...t.tools],
    looked: kinds(t.seen),
    missed: kinds(t.verdict?.missed ?? []),
    lies: c.lies.length,
    caught: t.caught.length,
    questioned: t.questioned.length,
    badCompares: t.badCompares,
    difficulty: c.meta.difficulty,
    proofCostS: c.meta.proofCostS,
  };
}

export function shiftRecord(input: ShiftRecordInput): ShiftRecord {
  const { state, souls } = traceShift(input.initial, input.actions, input.ctx);
  const score = shiftScore(state);
  return {
    v: 1,
    build: input.build,
    mode: input.mode,
    ...(input.n !== undefined ? { n: input.n } : {}),
    day: input.ctx.day,
    layout: input.layout,
    untimed: state.config.untimed === true,
    sunMs: state.sunMs,
    endedBy: state.endedBy ?? 'queue',
    guard: input.guard ?? 'unchecked',
    correct: score.correct,
    total: score.total,
    spareMs: score.spareMs,
    souls: souls.map((t) => soulRecord(state.cases[t.index] as CaseSpec, t)),
  };
}
