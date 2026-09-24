/**
 * The content shapes the engine runs on. The content compiler validates the
 * YAML packs with zod and emits objects of exactly these shapes
 * (docs/tech-spec.md §2 and §5).
 *
 * Chances are integer percentages and weights are integers, so the engine
 * never needs floating-point math.
 */

import type { Look } from '../gen/types';

export type Value = string | number | boolean;

export type Destination = 'VALHALLA' | 'FOLKVANGR' | 'HEL' | 'RAN' | 'RETURN' | 'DETAIN' | 'TRANSFER';
export const DESTINATIONS: readonly Destination[] = [
  'VALHALLA',
  'FOLKVANGR',
  'HEL',
  'RAN',
  'RETURN',
  'DETAIN',
  'TRANSFER',
];

export type ToolId = 'flip' | 'feather' | 'registry' | 'runeLens' | 'clippers';
export type View = 'front' | 'back';
export type Salience = 1 | 2 | 3;

/** One predicate language for rules, laws, whims, archetypes and endings. */
export type Pred =
  | { readonly fact: string; readonly is: Value }
  | { readonly fact: string; readonly in: readonly Value[] }
  | { readonly fact: string; readonly gte?: number; readonly lte?: number }
  | { readonly all: readonly Pred[] }
  | { readonly any: readonly Pred[] }
  | { readonly not: Pred }
  | { readonly ref: string }
  | { readonly param: string }
  | { readonly always: true };

export type Domain =
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'bool' }
  | { readonly kind: 'int'; readonly min: number; readonly max: number };

export interface FactDef {
  readonly id: string;
  readonly domain: Domain;
  /** Before this day the fact is pinned to `inert`, which keeps early days simple. */
  readonly since: number;
  readonly inert: Value;
  /** Enum values that only exist from a given day (e.g. drowning from day 5). */
  readonly valueSince?: Readonly<Record<string, number>>;
  /** Sampling weights keyed by String(value). Missing means uniform; 0 means "only if an archetype asks". */
  readonly prior?: Readonly<Record<string, number>>;
  /** A taught custom used when there's no evidence ("the fallen are dead"). */
  readonly presumption?: Value;
  /** Computed from other facts and never sampled. */
  readonly derived?: Pred;
}

export type ObsSource =
  | { readonly fact: string }
  | { readonly map: readonly { readonly when: Pred; readonly value: Value }[]; readonly otherwise: Value };

/** Something the player can see on the body, directly or with a tool. */
export interface ObservationDef {
  readonly key: string;
  readonly view: View;
  readonly tool?: ToolId;
  readonly since: number;
  readonly salience: Salience;
  /** Sun-seconds to inspect it (tool costs are counted once, separately). */
  readonly cost: number;
  /** `{ fact }` observations read the fact directly; `map` ones need a taught sign to interpret. */
  readonly from: ObsSource;
  /** Only rendered when this holds (e.g. which hand holds the weapon). */
  readonly when?: Pred;
  /** Read from a document rather than the body: its own evidence item, shown off the body. */
  readonly doc?: 'registry';
}

export type ObsPattern =
  | { readonly obs: string; readonly is: Value }
  | { readonly obs: string; readonly in: readonly Value[] }
  | { readonly all: readonly ObsPattern[] };

export interface FactConstraint {
  readonly fact: string;
  readonly in: readonly Value[];
}

/** A taught sign: what an observation tells you about a fact. */
export interface SignLaw {
  readonly id: string;
  readonly since: number;
  readonly text: string;
  readonly if: ObsPattern;
  readonly then: FactConstraint;
}

/** A taught custom linking facts, e.g. "no wounds means no battle death". */
export interface FactLaw {
  readonly id: string;
  readonly since: number;
  readonly text: string;
  readonly if: Pred;
  readonly then: FactConstraint;
}

/** A hint that tells a careful player to reach for a tool. It proves nothing on its own. */
export interface CueDef {
  readonly key: string;
  readonly view: View;
  readonly since: number;
  readonly salience: Salience;
  /** What it hints at: a fact's value, or a forged saga tally. */
  readonly hint: { readonly fact: string; readonly value: Value } | { readonly forgery: true };
}

/** Holds in every generated truth, on every day. */
export interface WorldConstraint {
  readonly id: string;
  readonly if: Pred;
  readonly then: Pred;
}

export interface NamedPredicate {
  readonly id: string;
  readonly versions: readonly { readonly since: number; readonly is: Pred }[];
}

export interface RuleDef {
  readonly id: string;
  readonly order: number;
  readonly since: number;
  readonly until?: number;
  readonly when: Pred;
  readonly then: Destination;
  readonly text: string;
}

export interface ToolDef {
  readonly id: ToolId;
  readonly since: number;
  readonly cost: number;
}

export type TruthConstraint =
  | { readonly is: Value }
  | { readonly in: readonly Value[] }
  | { readonly gte?: number; readonly lte?: number };

export type QuestionKind = 'confess' | 'excuse' | 'insist' | 'deflect';
export type Motive = 'wantsValhalla' | 'avoidHel' | 'hideFaith' | 'evadeRegistry' | 'mistaken' | 'mischief';

export interface LieSpec {
  readonly fact: string;
  readonly claim: Value;
  /** Percent chance, before the day's lieRate multiplier. */
  readonly p: number;
  readonly motive: Motive;
  /** Weights for how the soul answers when questioned. */
  readonly onQuestion: Readonly<Partial<Record<QuestionKind, number>>>;
  readonly since?: number;
  /** Carved on a forged saga tally instead of spoken (docs/tech-spec.md §3.4). */
  readonly via?: 'tally';
}

/** A line carved on a saga tally: what the soul's deeds say about one fact. */
export interface TallyTemplate {
  readonly id: string;
  readonly asserts: { readonly fact: string; readonly value: Value };
  readonly msg: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly weight: number;
}

/** A character type the generator samples souls from. */
export interface ArchetypeDef {
  readonly id: string;
  readonly since: number;
  readonly until?: number;
  readonly personas: readonly string[];
  readonly truth: Readonly<Record<string, TruthConstraint>>;
  /** Extra conditions such as Freyja's whim; simple ones become sampling constraints. */
  readonly require?: readonly Pred[];
  readonly lies: readonly LieSpec[];
}

export type SpeechSlot =
  | 'identity'
  | 'death'
  | 'weapon'
  | 'owner'
  | 'blade'
  | 'back'
  | 'oath'
  | 'creed'
  | 'guise'
  | 'flavor';

/** One slot of a soul's speech: which fact it talks about and how often. */
export interface SpeechSlotDef {
  readonly slot: SpeechSlot;
  readonly fact?: string;
  /** Percent chance the slot is spoken when the soul isn't lying about its fact. */
  readonly chance: number;
  readonly since: number;
}

export interface TestimonyTemplate {
  readonly id: string;
  readonly slot: SpeechSlot;
  readonly asserts?: { readonly fact: string; readonly value: Value };
  readonly personas?: readonly string[];
  readonly msg: string;
  /** Placeholder name to pool id, e.g. `{ place: pool.places }`. */
  readonly params?: Readonly<Record<string, string>>;
  readonly weight: number;
}

export interface RavenTemplate {
  readonly id: string;
  readonly raven: 'huginn' | 'muninn';
  /** Selects special lines, e.g. Muninn's `identity` or `forgot`. */
  readonly tag?: string;
  readonly asserts?: { readonly fact: string; readonly value: Value };
  readonly msg: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly weight: number;
}

export interface QuestionTemplate {
  readonly id: string;
  readonly on: {
    readonly fact: string;
    readonly claimed?: Value;
    readonly truth?: readonly Value[];
    readonly persona?: readonly string[];
    readonly kind: QuestionKind;
    /** Only for lies carved on a forged tally. */
    readonly via?: 'tally';
  };
  readonly msgs: readonly string[];
  readonly weight: number;
}

export interface Knobs {
  /** Percent multiplier on archetype lie chances. */
  readonly lieRate: number;
  readonly maxLies: number;
  /** Percent chance of a misleading cue on a soul whose truth doesn't match it. */
  readonly decoyRate: number;
  /** Percent chance Huginn reports each decisive fact he has a line for. */
  readonly ravenRate: number;
  /** Percent chance Muninn forgets who the soul was. */
  readonly forgetRate: number;
  /** Allowed sun-second range for the minimal proof. */
  readonly proofCostS: readonly [number, number];
  readonly maxTools: number;
  readonly maxDocs: number;
  readonly salienceFloor: Salience;
  /** Percent chance an honest soul carries a saga tally (Day 11 on). */
  readonly tallyRate?: number;
}

export interface DayParam {
  readonly pool: readonly { readonly id: string; readonly text: string; readonly is: Pred }[];
}

export type Faction = 'odin' | 'freyja' | 'hel' | 'loki' | 'clerk';
export const FACTIONS: readonly Faction[] = ['odin', 'freyja', 'hel', 'loki', 'clerk'];

/** Pay and bills for one campaign day (docs/tech-spec.md §4). */
export interface Economy {
  /** Rings for each soul judged rightly. */
  readonly wage: number;
  /** Extra rings when you also caught the soul's lie before stamping. */
  readonly docBonus: number;
  /** Citations per day that cost nothing. */
  readonly warnings: number;
  /** Fines for the citations after that, the last one repeating. */
  readonly fines: readonly number[];
  /** Tonight's bills: the hearth, food per person at home, medicine per sick person. */
  readonly costs: { readonly hearth: number; readonly food: number; readonly medicine: number };
}

export interface DaySpec {
  readonly day: number;
  readonly sunS: number;
  readonly decree: string;
  /** Campaign days only. */
  readonly economy?: Economy;
  /** Campaign days only: the Ink scenes played before the shift and at night. */
  readonly scenes?: { readonly morning?: string; readonly night?: string };
  readonly params?: Readonly<Record<string, DayParam>>;
  readonly queue: {
    readonly count: readonly [number, number];
    /** Archetype for the first soul of the day, to teach the new rule. */
    readonly teachFirst?: string;
    /** A fixed queue (the primer): each slot's archetype and destination, in order. Overrides count and mix. */
    readonly script?: readonly { readonly id: string; readonly dest: Destination }[];
    /** Campaign only: story souls added to the generated queue, each at its position (0-based). */
    readonly scripted?: readonly { readonly case: string; readonly at: number }[];
    readonly archetypes: readonly { readonly id: string; readonly w: number }[];
    /** Percent [min, max] share of the queue per destination. */
    readonly mix: Readonly<Partial<Record<Destination, readonly [number, number]>>>;
    readonly knobs: Knobs;
  };
}

/** A condition on the campaign run (endings); two-valued. Paths are listed in engine/campaign/state.ts. */
export type StatePred =
  | { readonly state: string; readonly is?: number; readonly gte?: number; readonly lte?: number }
  | { readonly all: readonly StatePred[] }
  | { readonly any: readonly StatePred[] }
  | { readonly not: StatePred };

/**
 * Something the player must do to a soul before sending it on, beyond the
 * stamp: clipping untrimmed nails under the Naglfar decree. A judgment is the
 * destination plus every procedure whose condition holds (docs/tech-spec.md §2).
 */
export interface ProcedureDef {
  readonly id: string;
  readonly since: number;
  readonly until?: number;
  readonly when: Pred;
  /** Done by using this tool on the soul. */
  readonly tool: ToolId;
  /** Rulebook line. */
  readonly text: string;
}

/**
 * A soul written for the story (docs/tech-spec.md §4, "Scripted cases"). It is
 * generated like any other soul, from its own truth constraints and lies, but
 * with a fixed identity and a seed of its own, so it is the same soul in every
 * run; then it must pass the same F1-F8 validator. The compiler proves that
 * for every day that places it.
 */
export interface ScriptedCaseDef {
  readonly id: string;
  readonly personas: readonly string[];
  readonly truth: Readonly<Record<string, TruthConstraint>>;
  readonly require?: readonly Pred[];
  readonly lies: readonly LieSpec[];
  readonly look: Look;
  /** Extra lines the soul says (string keys). They claim nothing, so they can't change a judgment. */
  readonly lines?: readonly string[];
  /** Where the soul belongs; the compiler checks the generated case agrees. */
  readonly expect: Destination;
  /** Only in the queue when this holds as the shift begins. */
  readonly when?: StatePred;
  /** Story consequences at the audit, by the stamp used (`*` matches any stamp; unjudged souls do nothing). */
  readonly onStamp?: readonly { readonly stamped: Destination | '*'; readonly effects: readonly Effect[] }[];
}

/** What a story scene (or a scripted soul) does to the run, applied once. */
export type Effect =
  | { readonly rings: number }
  | { readonly standing: Faction; readonly by: number }
  | { readonly flag: string; readonly set?: number; readonly inc?: number }
  | { readonly family: string; readonly becomes: 'sick' | 'well' };

export interface FamilyDef {
  readonly id: string;
  /** String key. */
  readonly name: string;
  /** Adults can die; children fall ill or are sent away, but never die (docs/build-plan.md §1). */
  readonly adult: boolean;
}

/** Speed only: cheaper tools or questions, or more sun. Never changes what can be solved. */
export type UpgradeEffect =
  | { readonly tool: ToolId; readonly costS: number }
  | { readonly questionS: number }
  | { readonly sunS: number };

export interface UpgradeDef {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly price: number;
  readonly since: number;
  readonly effect: UpgradeEffect;
}

export interface EndingDef {
  readonly id: string;
  /** Lower orders are checked first. */
  readonly order: number;
  /** Without a condition, an ending only happens as the campaign's finale. */
  readonly when?: StatePred;
  readonly title: string;
  readonly text: string;
}

/** Standing changes for a (expected, stamped) pair; the first matching row applies. */
export interface StandingRule {
  readonly expected: Destination | '*';
  readonly stamped: Destination | '*';
  readonly fx: Readonly<Partial<Record<Faction, number>>>;
}

/**
 * The vertical slice (M5): the first days, then a jump over the unwritten
 * middle to one late day, with what the skipped days would have brought.
 */
export interface SliceDef {
  /** The last day played before the jump. */
  readonly after: number;
  /** The day jumped to; its night ends the slice with `finale`. */
  readonly day: number;
  readonly finale: string;
  /** Added to the run when it jumps: rings earned, standing moved and story flags set in the skipped days. */
  readonly preset: {
    readonly rings?: number;
    readonly standing?: Readonly<Partial<Record<Faction, number>>>;
    readonly flags?: Readonly<Record<string, number>>;
  };
}

/** The campaign's economy, family, shop and endings (the demo and campaign packs each supply part). */
export interface CampaignDef {
  /** The last playable day in this build; its night ends with `finale` unless another ending comes first. */
  readonly lastDay: number;
  readonly finale: string;
  readonly startRings: number;
  readonly family: readonly FamilyDef[];
  /** Odin's ring Draupnir drips eight rings every ninth night. */
  readonly draupnir: { readonly nights: readonly number[]; readonly rings: number };
  /** Nights ending below this many rings count as nights in debt. */
  readonly debtFloor: number;
  /**
   * Family care: nights in a row without the hearth or food before someone
   * surely falls sick; the percent chance per unmet need of falling sick sooner
   * (so skipping a night is a gamble, not free); and nights sick without
   * medicine before they're lost.
   */
  readonly care: { readonly needNights: number; readonly sickChance: number; readonly sickNights: number };
  /** The vertical slice, when this build has one. */
  readonly slice?: SliceDef;
  readonly standing: readonly StandingRule[];
  readonly shop: readonly UpgradeDef[];
  readonly endings: readonly EndingDef[];
  /** The named predicate that makes a Valhalla stamp a worthy einherjar. */
  readonly worthy: string;
}

export interface Content {
  readonly genVersion: number;
  readonly facts: readonly FactDef[];
  readonly observations: readonly ObservationDef[];
  readonly signLaws: readonly SignLaw[];
  readonly factLaws: readonly FactLaw[];
  readonly cues: readonly CueDef[];
  readonly world: readonly WorldConstraint[];
  readonly predicates: readonly NamedPredicate[];
  readonly rules: readonly RuleDef[];
  readonly tools: readonly ToolDef[];
  readonly archetypes: readonly ArchetypeDef[];
  readonly speech: readonly SpeechSlotDef[];
  readonly testimony: readonly TestimonyTemplate[];
  readonly ravens: readonly RavenTemplate[];
  readonly questions: readonly QuestionTemplate[];
  readonly pools: Readonly<Record<string, readonly string[]>>;
  readonly days: readonly DaySpec[];
  /** The Daily Shift: same souls for everyone on a date. `day` is the mechanics day it plays with. */
  readonly daily?: DaySpec;
  /** The primer: a short scripted shift that teaches the Daily's tools. */
  readonly primer?: DaySpec;
  /** Campaign rules, in builds that ship campaign days. */
  readonly campaign?: CampaignDef;
  /** Story souls that campaign days place in their queues. */
  readonly scripted?: readonly ScriptedCaseDef[];
  /** Things to do to a soul besides stamping it (Day 8 on). */
  readonly procedures?: readonly ProcedureDef[];
  /** Saga tally lines (Day 11 on). */
  readonly tallies?: readonly TallyTemplate[];
}
