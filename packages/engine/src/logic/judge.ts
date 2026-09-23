import type { Destination, ObservationDef, Value } from '../content/types';
import type { DayCtx } from './context';
import { eval2, type Truth } from './pred';

export interface Judgment {
  readonly dest: Destination;
  readonly rule: string;
}

/** The correct judgment for a complete truth: the first rule in force that holds. */
export function judge(truth: Truth, ctx: DayCtx): Judgment {
  for (const r of ctx.rules) {
    if (eval2(r.when, truth, ctx)) return { dest: r.then, rule: r.id };
  }
  throw new Error(`The rulebook for day ${ctx.day} has no rule that always applies`);
}

/** Adds derived facts (e.g. `fled`) to sampled ones, in content order. */
export function completeTruth(base: Readonly<Record<string, Value>>, ctx: DayCtx): Truth {
  const out: Record<string, Value> = { ...base };
  for (const id of ctx.derived) {
    const def = ctx.facts.get(id)?.def;
    if (def?.derived) out[id] = eval2(def.derived, out, ctx);
  }
  return out;
}

/**
 * The truth with one fact changed. Sampled facts recompute what derives from
 * them; a derived fact is overridden directly (used to ask "what if the lie
 * were true?").
 */
export function withOverride(truth: Truth, fact: string, value: Value, ctx: DayCtx): Truth {
  const def = ctx.facts.get(fact)?.def;
  if (def?.derived) return { ...truth, [fact]: value };
  const base: Record<string, Value> = {};
  for (const id of ctx.sampled) base[id] = truth[id] as Value;
  base[fact] = value;
  return completeTruth(base, ctx);
}

/** What an observation shows for a truth. */
export function observe(obs: ObservationDef, truth: Truth, ctx: DayCtx): Value {
  if ('fact' in obs.from) return truth[obs.from.fact] as Value;
  for (const m of obs.from.map) if (eval2(m.when, truth, ctx)) return m.value;
  return obs.from.otherwise;
}
