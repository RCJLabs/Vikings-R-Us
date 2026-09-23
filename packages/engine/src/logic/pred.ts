import type { Pred, Value } from '../content/types';
import type { PredCtx } from './context';

export type Truth = Readonly<Record<string, Value>>;

/** Kleene three-valued logic: true, false, unknown. */
export type Tri = 'T' | 'F' | 'U';

/** Evaluates a predicate against a complete truth. Missing refs and params are false. */
export function eval2(p: Pred, truth: Truth, ctx: PredCtx): boolean {
  if ('fact' in p) {
    const v = truth[p.fact];
    if (v === undefined) return false;
    if ('is' in p) return v === p.is;
    if ('in' in p) return p.in.includes(v);
    return typeof v === 'number' && (p.gte === undefined || v >= p.gte) && (p.lte === undefined || v <= p.lte);
  }
  if ('all' in p) return p.all.every((q) => eval2(q, truth, ctx));
  if ('any' in p) return p.any.some((q) => eval2(q, truth, ctx));
  if ('not' in p) return !eval2(p.not, truth, ctx);
  if ('ref' in p) {
    const q = ctx.predicates.get(p.ref);
    return q ? eval2(q, truth, ctx) : false;
  }
  if ('param' in p) {
    const q = ctx.params[p.param];
    return q ? eval2(q, truth, ctx) : false;
  }
  return true;
}

/** Possible values of each fact, as far as the player can tell. */
export type ValuesOf = (fact: string) => readonly Value[];

function factTri(p: Extract<Pred, { fact: string }>, values: readonly Value[]): Tri {
  let sat: (v: Value) => boolean;
  if ('is' in p) sat = (v) => v === p.is;
  else if ('in' in p) sat = (v) => p.in.includes(v);
  else sat = (v) => typeof v === 'number' && (p.gte === undefined || v >= p.gte) && (p.lte === undefined || v <= p.lte);
  let some = false;
  let every = true;
  for (const v of values) {
    if (sat(v)) some = true;
    else every = false;
  }
  if (values.length > 0 && every) return 'T';
  return some ? 'U' : 'F';
}

/** Evaluates a predicate over sets of possible values (Kleene logic). */
export function eval3(p: Pred, valuesOf: ValuesOf, ctx: PredCtx): Tri {
  if ('fact' in p) return factTri(p, valuesOf(p.fact));
  if ('all' in p) {
    let unknown = false;
    for (const q of p.all) {
      const r = eval3(q, valuesOf, ctx);
      if (r === 'F') return 'F';
      if (r === 'U') unknown = true;
    }
    return unknown ? 'U' : 'T';
  }
  if ('any' in p) {
    let unknown = false;
    for (const q of p.any) {
      const r = eval3(q, valuesOf, ctx);
      if (r === 'T') return 'T';
      if (r === 'U') unknown = true;
    }
    return unknown ? 'U' : 'F';
  }
  if ('not' in p) {
    const r = eval3(p.not, valuesOf, ctx);
    return r === 'T' ? 'F' : r === 'F' ? 'T' : 'U';
  }
  if ('ref' in p) {
    const q = ctx.predicates.get(p.ref);
    return q ? eval3(q, valuesOf, ctx) : 'F';
  }
  if ('param' in p) {
    const q = ctx.params[p.param];
    return q ? eval3(q, valuesOf, ctx) : 'F';
  }
  return 'T';
}

/** Every fact a predicate reads, following refs and params. */
export function factsIn(p: Pred, ctx: PredCtx, out: Set<string> = new Set()): Set<string> {
  if ('fact' in p) out.add(p.fact);
  else if ('all' in p) for (const q of p.all) factsIn(q, ctx, out);
  else if ('any' in p) for (const q of p.any) factsIn(q, ctx, out);
  else if ('not' in p) factsIn(p.not, ctx, out);
  else if ('ref' in p) {
    const q = ctx.predicates.get(p.ref);
    if (q) factsIn(q, ctx, out);
  } else if ('param' in p) {
    const q = ctx.params[p.param];
    if (q) factsIn(q, ctx, out);
  }
  return out;
}
