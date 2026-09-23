/**
 * The content shapes the engine runs on. The content compiler validates the
 * YAML packs with zod and emits objects of exactly these shapes
 * (docs/tech-spec.md §2 and §5).
 *
 * Chances are integer percentages and weights are integers, so the engine
 * never needs floating-point math.
 */

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

export type ToolId = 'flip' | 'feather' | 'runeLens' | 'clippers';
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
  readonly hint: { readonly fact: string; readonly value: Value };
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

export type SpeechSlot = 'identity' | 'death' | 'weapon' | 'back' | 'flavor';

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
}

export interface DayParam {
  readonly pool: readonly { readonly id: string; readonly text: string; readonly is: Pred }[];
}

export interface DaySpec {
  readonly day: number;
  readonly sunS: number;
  readonly decree: string;
  readonly params?: Readonly<Record<string, DayParam>>;
  readonly queue: {
    readonly count: readonly [number, number];
    /** Archetype for the first soul of the day, to teach the new rule. */
    readonly teachFirst?: string;
    /** A fixed queue (the primer): each slot's archetype and destination, in order. Overrides count and mix. */
    readonly script?: readonly { readonly id: string; readonly dest: Destination }[];
    readonly archetypes: readonly { readonly id: string; readonly w: number }[];
    /** Percent [min, max] share of the queue per destination. */
    readonly mix: Readonly<Partial<Record<Destination, readonly [number, number]>>>;
    readonly knobs: Knobs;
  };
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
}
