import type { Destination, ObsPattern, Value } from '../content/types';
import type { Field } from '../gen/types';
import type { DayCtx } from './context';
import { eval3, factsIn, type Tri } from './pred';

/**
 * What the player can know about a fact. Levels follow the trust ladder
 * (docs/tech-spec.md §3.1): 4 = established by a body sign, a raven or a
 * confession; 1 = presumed; 0 = unknown.
 */
export interface Belief {
  readonly values: readonly Value[];
  readonly level: number;
  /** Field ids (plus 'world' and 'q:<lie>') that established it. */
  readonly support: readonly string[];
}

export interface Contradiction {
  /** The testimony field that is shown to be false. */
  readonly lie: string;
  readonly fact: string;
  readonly against: readonly string[];
}

export type SolveJudgment =
  | {
      readonly kind: 'determined';
      readonly dest: Destination;
      readonly rule: string;
      /** Procedures known to be due (absent when none). */
      readonly procedures?: readonly string[];
    }
  | { readonly kind: 'undetermined'; readonly rule: string; readonly blocking: readonly string[] };

export interface SolveResult {
  readonly judgment: SolveJudgment;
  readonly beliefs: ReadonlyMap<string, Belief>;
  readonly contradictions: readonly Contradiction[];
  /** Established evidence that disagrees with itself. Never happens in a fair case (F2). */
  readonly conflicts: readonly { readonly fact: string; readonly support: readonly string[] }[];
  readonly rules: readonly { readonly rule: string; readonly result: Tri }[];
}

export interface SolveOptions {
  /** What questioning would reveal: lie field id -> the fact's true value. */
  readonly reveals?: ReadonlyMap<string, { readonly fact: string; readonly value: Value }>;
  /** The "trusting" bot: what the soul says (aloud or on its tally) overrides everything else. */
  readonly trustTestimony?: boolean;
}

export function isPerceivable(f: Field, ctx: DayCtx): boolean {
  if (f.view === 'back' && !ctx.tools.has('flip')) return false;
  if (f.tool !== undefined && !ctx.tools.has(f.tool)) return false;
  return true;
}

function union(a: readonly string[], b: readonly string[]): string[] {
  if (b.length === 0) return a.slice();
  const out = a.slice();
  for (const x of b) if (!out.includes(x)) out.push(x);
  return out;
}

type Seen = ReadonlyMap<string, { readonly value: Value; readonly field: string }>;

function matchObs(p: ObsPattern, seen: Seen): string[] | null {
  if ('all' in p) {
    const ids: string[] = [];
    for (const q of p.all) {
      const r = matchObs(q, seen);
      if (!r) return null;
      ids.push(...r);
    }
    return ids;
  }
  const s = seen.get(p.obs);
  if (!s) return null;
  if ('is' in p) return s.value === p.is ? [s.field] : null;
  return p.in.includes(s.value) ? [s.field] : null;
}

/**
 * Works out the judgment from the player's point of view: only perceivable
 * fields, only taught laws, the trust ladder and presumptions. Sound but
 * conservative; the brute-force oracle in testkit checks it.
 */
export function solve(fields: readonly Field[], ctx: DayCtx, opts: SolveOptions = {}): SolveResult {
  const beliefs = new Map<string, Belief>();
  const asserted = new Map<string, Belief>(); // statements about derived facts
  const forced = new Map<string, Belief>(); // trusting bot only
  const conflicts: { fact: string; support: string[] }[] = [];

  for (const [id, af] of ctx.facts) {
    if (af.def.derived) continue;
    beliefs.set(id, { values: af.values, level: af.pinned ? 4 : 0, support: af.pinned ? ['world'] : [] });
  }

  const view = (fact: string): Belief => {
    const f = forced.get(fact);
    if (f) return f;
    const af = ctx.facts.get(fact);
    const derived = af?.def.derived;
    if (!derived) return beliefs.get(fact) ?? { values: [], level: 0, support: [] };
    const inputs = [...factsIn(derived, ctx)].map(view);
    const tri = eval3(derived, (id) => view(id).values, ctx);
    let values: Value[] = tri === 'T' ? [true] : tri === 'F' ? [false] : [false, true];
    let level = inputs.reduce((m, b) => Math.min(m, b.level), 4);
    let support = inputs.reduce<string[]>((s, b) => union(s, b.support), []);
    const a = asserted.get(fact);
    if (a) {
      const both = values.filter((v) => a.values.includes(v));
      if (both.length < values.length) {
        values = both;
        level = Math.max(level, a.level);
        support = union(support, a.support);
      }
    }
    return { values, level, support };
  };
  const valuesOf = (fact: string) => view(fact).values;

  /** Narrows a fact to `allowed`. Returns true if anything changed. */
  const narrow = (fact: string, allowed: readonly Value[], level: number, support: readonly string[]): boolean => {
    const af = ctx.facts.get(fact);
    if (!af) return false;
    const map = af.def.derived ? asserted : beliefs;
    const b = map.get(fact) ?? { values: af.values, level: 0, support: [] };
    const next = b.values.filter((v) => allowed.includes(v));
    if (next.length === 0) {
      conflicts.push({ fact, support: union(b.support, support) });
      return false;
    }
    const changed = next.length < b.values.length;
    map.set(fact, {
      values: next,
      level: Math.max(b.level, level),
      support: changed ? union(b.support, support) : b.support.slice(),
    });
    return changed;
  };

  const perceived = fields.filter((f) => isPerceivable(f, ctx));
  const seen = new Map<string, { value: Value; field: string }>();
  for (const f of perceived) if (f.obs) seen.set(f.obs.key, { value: f.obs.value, field: f.id });

  // Body signs read directly (a weapon in hand is a weapon in hand).
  for (const f of perceived) {
    if (!f.obs) continue;
    const def = ctx.observationByKey.get(f.obs.key);
    if (def && 'fact' in def.from) narrow(def.from.fact, [f.obs.value], 4, [f.id]);
  }
  // Body signs read through a taught law.
  for (const law of ctx.signLaws) {
    const used = matchObs(law.if, seen);
    if (used) narrow(law.then.fact, law.then.in, 4, used);
  }
  // The ravens never lie.
  for (const f of perceived) {
    if ((f.item === 'huginn' || f.item === 'muninn') && f.says && f.says.value !== null) {
      narrow(f.says.fact, [f.says.value], 4, [f.id]);
    }
  }
  if (opts.trustTestimony) {
    // The trusting bot believes what the soul says and what its tally says.
    for (const f of perceived) {
      if ((f.item === 'testimony' || f.item === 'tally') && f.says && f.says.value !== null) {
        forced.set(f.says.fact, { values: [f.says.value], level: 5, support: [f.id] });
      }
    }
  }

  const propagate = (): void => {
    for (let round = 0; round < 16; round++) {
      let changed = false;
      for (const law of ctx.factLaws) {
        if (eval3(law.if, valuesOf, ctx) !== 'T') continue;
        const support = [...factsIn(law.if, ctx)].reduce<string[]>((s, id) => union(s, view(id).support), []);
        if (narrow(law.then.fact, law.then.in, 4, support)) changed = true;
      }
      if (!changed) return;
    }
  };
  propagate();

  const contradictions: Contradiction[] = [];

  // The saga tally counts at trust 3, unless a forgery sign on it has been seen (then it counts for
  // nothing). Where it disagrees with established evidence, the line is a lie to catch either way.
  const forgerySeen = perceived.some((f) => f.tell !== undefined);
  let carved = false;
  for (const f of perceived) {
    if (f.item !== 'tally' || !f.says || f.says.value === null) continue;
    const b = view(f.says.fact);
    if (b.level >= 3 && !b.values.includes(f.says.value)) {
      if (!opts.trustTestimony) contradictions.push({ lie: f.id, fact: f.says.fact, against: b.support });
    } else if (!forgerySeen && narrow(f.says.fact, [f.says.value], 3, [f.id])) carved = true;
  }
  if (carved) propagate();

  if (!opts.trustTestimony) {
    for (const f of perceived) {
      if (f.item !== 'testimony' || !f.says || f.says.value === null) continue;
      const b = view(f.says.fact);
      if (b.level >= 3 && !b.values.includes(f.says.value)) {
        contradictions.push({ lie: f.id, fact: f.says.fact, against: b.support });
      }
    }
  }

  if (opts.reveals && contradictions.length > 0) {
    let revealed = false;
    for (const c of contradictions) {
      const r = opts.reveals.get(c.lie);
      if (r && narrow(r.fact, [r.value], 4, [`q:${c.lie}`])) revealed = true;
    }
    if (revealed) propagate();
  }

  // Presumptions fill in only what nothing else established.
  for (const [id, af] of ctx.facts) {
    const p = af.def.presumption;
    if (p === undefined || af.def.derived) continue;
    const b = beliefs.get(id);
    if (b && b.level === 0 && b.values.includes(p)) beliefs.set(id, { values: [p], level: 1, support: [] });
  }

  const rules = ctx.rules.map((r) => ({ rule: r.id, result: eval3(r.when, valuesOf, ctx) }));
  let judgment: SolveJudgment | undefined;
  for (let i = 0; i < rules.length && !judgment; i++) {
    const r = ctx.rules[i];
    const res = rules[i];
    if (!r || !res) break;
    if (res.result === 'T') judgment = { kind: 'determined', dest: r.then, rule: r.id };
    else if (res.result === 'U') {
      const blocking = [...factsIn(r.when, ctx)].filter((id) => view(id).values.length > 1);
      judgment = { kind: 'undetermined', rule: r.id, blocking };
    }
  }
  if (!judgment) throw new Error(`The rulebook for day ${ctx.day} has no rule that always applies`);

  // The judgment also says which procedures are due; one the player can't settle leaves it undetermined.
  if (judgment.kind === 'determined' && ctx.procedures.length > 0) {
    const due: string[] = [];
    for (const p of ctx.procedures) {
      const res = eval3(p.when, valuesOf, ctx);
      if (res === 'T') due.push(p.id);
      else if (res === 'U') {
        const blocking = [...factsIn(p.when, ctx)].filter((id) => view(id).values.length > 1);
        judgment = { kind: 'undetermined', rule: p.id, blocking };
        break;
      }
    }
    if (judgment.kind === 'determined' && due.length > 0) judgment = { ...judgment, procedures: due };
  }

  const all = new Map<string, Belief>();
  for (const id of ctx.facts.keys()) all.set(id, view(id));
  return { judgment, beliefs: all, contradictions, conflicts, rules };
}
