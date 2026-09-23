import type {
  ArchetypeDef,
  Content,
  CueDef,
  DaySpec,
  Destination,
  FactDef,
  FactLaw,
  ObservationDef,
  Pred,
  RuleDef,
  SignLaw,
  ToolId,
  Value,
} from '../content/types';
import { Rng } from '../rng/rng';

export interface ActiveFact {
  readonly def: FactDef;
  /** Values possible today. Derived facts are always [false, true]. */
  readonly values: readonly Value[];
  /** Fixed for the whole day (not yet introduced, or only one value exists yet). */
  readonly pinned: boolean;
}

export interface PredCtx {
  readonly predicates: ReadonlyMap<string, Pred>;
  readonly params: Readonly<Record<string, Pred>>;
}

/** Everything the engine needs to know about one day (docs/tech-spec.md §3). */
export interface DayCtx extends PredCtx {
  readonly content: Content;
  readonly day: number;
  readonly spec: DaySpec;
  readonly facts: ReadonlyMap<string, ActiveFact>;
  /** Non-derived facts in content order: the sampling order. */
  readonly sampled: readonly string[];
  /** Derived facts in content order: the computation order. */
  readonly derived: readonly string[];
  /** Rules in force today, in evaluation order. */
  readonly rules: readonly RuleDef[];
  /** Which pool entry each day parameter drew (for the decree text). */
  readonly paramChoices: Readonly<Record<string, { readonly id: string; readonly text: string }>>;
  /** Observations that exist today (their tools are unlocked). */
  readonly observations: readonly ObservationDef[];
  readonly observationByKey: ReadonlyMap<string, ObservationDef>;
  readonly signLaws: readonly SignLaw[];
  readonly factLaws: readonly FactLaw[];
  readonly cues: readonly CueDef[];
  /** Unlocked tools and their sun-second cost. */
  readonly tools: ReadonlyMap<ToolId, number>;
  readonly archetypes: ReadonlyMap<string, ArchetypeDef>;
  readonly queueArchetypes: readonly { readonly def: ArchetypeDef; readonly w: number }[];
  readonly destinations: ReadonlySet<Destination>;
}

export function activeValues(def: FactDef, day: number): Value[] {
  const d = def.domain;
  if (d.kind === 'bool') return [false, true];
  if (d.kind === 'int') {
    const out: number[] = [];
    for (let v = d.min; v <= d.max; v++) out.push(v);
    return out;
  }
  return d.values.filter((v) => (def.valueSince?.[v] ?? 1) <= day);
}

const byOrder = (a: RuleDef, b: RuleDef): number => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Builds the context for `day`. Day parameters (e.g. Freyja's whim) are drawn
 * from `runSeed`. Pass `spec` to play a day's mechanics with another queue
 * (the Daily Shift uses its own spec).
 */
export function createDayContext(content: Content, day: number, runSeed: string, spec?: DaySpec): DayCtx {
  const found = spec ?? content.days.find((d) => d.day === day);
  if (!found) throw new Error(`No day spec for day ${day}`);
  return buildContext(content, day, runSeed, found);
}

function buildContext(content: Content, day: number, runSeed: string, spec: DaySpec): DayCtx {
  const facts = new Map<string, ActiveFact>();
  const sampled: string[] = [];
  const derived: string[] = [];
  for (const def of content.facts) {
    if (def.derived) {
      facts.set(def.id, { def, values: [false, true], pinned: false });
      derived.push(def.id);
      continue;
    }
    const values = def.since > day ? [def.inert] : activeValues(def, day);
    facts.set(def.id, { def, values, pinned: values.length === 1 });
    sampled.push(def.id);
  }

  const inForce = (since: number, until?: number) => since <= day && (until === undefined || day < until);
  const rules = content.rules.filter((r) => inForce(r.since, r.until)).sort(byOrder);

  const predicates = new Map<string, Pred>();
  for (const np of content.predicates) {
    const versions = np.versions.filter((v) => v.since <= day).sort((a, b) => a.since - b.since);
    const latest = versions[versions.length - 1];
    if (latest) predicates.set(np.id, latest.is);
  }

  const params: Record<string, Pred> = {};
  const paramChoices: Record<string, { id: string; text: string }> = {};
  for (const [name, param] of Object.entries(spec.params ?? {})) {
    const choice = new Rng(`${content.genVersion}|${runSeed}|${day}|param|${name}`).pick(param.pool);
    params[name] = choice.is;
    paramChoices[name] = { id: choice.id, text: choice.text };
  }

  const tools = new Map<ToolId, number>();
  for (const t of content.tools) if (t.since <= day) tools.set(t.id, t.cost);

  const observations = content.observations.filter(
    (o) => o.since <= day && (o.view !== 'back' || tools.has('flip')) && (o.tool === undefined || tools.has(o.tool)),
  );

  const archetypes = new Map(content.archetypes.map((a) => [a.id, a]));
  const queueArchetypes = spec.queue.archetypes.map(({ id, w }) => {
    const def = archetypes.get(id);
    if (!def) throw new Error(`Day ${day} uses unknown archetype "${id}"`);
    return { def, w };
  });

  return {
    content,
    day,
    spec,
    facts,
    sampled,
    derived,
    rules,
    predicates,
    params,
    paramChoices,
    observations,
    observationByKey: new Map(content.observations.map((o) => [o.key, o])),
    signLaws: content.signLaws.filter((l) => l.since <= day),
    factLaws: content.factLaws.filter((l) => l.since <= day),
    cues: content.cues.filter((c) => c.since <= day),
    tools,
    archetypes,
    queueArchetypes,
    destinations: new Set(rules.map((r) => r.then)),
  };
}
