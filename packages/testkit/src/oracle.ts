import {
  completeTruth,
  type DayCtx,
  type Destination,
  eval2,
  type Field,
  isPerceivable,
  judge,
  type ObsPattern,
  type Truth,
  type Value,
} from '@cots/engine';

export type OracleResult =
  | { readonly kind: 'determined'; readonly dest: Destination }
  | { readonly kind: 'undetermined' };

function obsMatches(p: ObsPattern, seen: ReadonlyMap<string, Value>): boolean {
  if ('all' in p) return p.all.every((q) => obsMatches(q, seen));
  const v = seen.get(p.obs);
  if (v === undefined) return false;
  return 'is' in p ? v === p.is : p.in.includes(v);
}

/**
 * Brute force: enumerate every world consistent with what the player can
 * perceive and has been taught, let a consistent, unforged saga tally narrow them, apply
 * presumptions to facts nothing constrains, and see whether all remaining
 * worlds agree on the destination.
 * Exact, slow, and independent of the solver's propagation logic.
 */
export function oracleSolve(fields: readonly Field[], ctx: DayCtx): OracleResult {
  const perceived = fields.filter((f) => isPerceivable(f, ctx));
  const seen = new Map<string, Value>();
  const direct = new Map<string, Value>();
  for (const f of perceived) {
    if (!f.obs) continue;
    seen.set(f.obs.key, f.obs.value);
    const def = ctx.observationByKey.get(f.obs.key);
    if (def && 'fact' in def.from) direct.set(def.from.fact, f.obs.value);
  }
  const statements = perceived.filter(
    (f) => (f.item === 'huginn' || f.item === 'muninn') && f.says && f.says.value !== null,
  );

  const vars = ctx.sampled.filter((id) => !ctx.facts.get(id)?.pinned);
  const domains = vars.map((id) => {
    const all = ctx.facts.get(id)?.values ?? [];
    return direct.has(id) ? all.filter((v) => v === direct.get(id)) : all;
  });

  const consistent: Truth[] = [];
  const base: Record<string, Value> = {};
  for (const id of ctx.sampled) {
    const af = ctx.facts.get(id);
    if (af?.pinned) base[id] = af.values[0] as Value;
  }
  const visit = (i: number): void => {
    if (i === vars.length) {
      const t = completeTruth(base, ctx);
      for (const law of ctx.signLaws) {
        if (obsMatches(law.if, seen) && !law.then.in.includes(t[law.then.fact] as Value)) return;
      }
      for (const law of ctx.factLaws) {
        if (eval2(law.if, t, ctx) && !law.then.in.includes(t[law.then.fact] as Value)) return;
      }
      for (const s of statements) if (t[s.says?.fact as string] !== s.says?.value) return;
      consistent.push(t);
      return;
    }
    for (const v of domains[i] ?? []) {
      base[vars[i] as string] = v;
      visit(i + 1);
    }
  };
  visit(0);

  // A saga tally narrows the worlds (it outranks presumptions) if all its lines can be true together;
  // otherwise, or once a forgery sign is seen, it counts for nothing.
  let worlds = consistent;
  const forgerySeen = perceived.some((f) => f.tell !== undefined);
  const carved = forgerySeen ? [] : perceived.filter((f) => f.item === 'tally' && f.says && f.says.value !== null);
  if (carved.length > 0) {
    const agree = worlds.filter((t) => carved.every((line) => t[line.says?.fact as string] === line.says?.value));
    if (agree.length > 0) worlds = agree;
  }
  for (const [id, af] of ctx.facts) {
    const p = af.def.presumption;
    if (p === undefined || af.def.derived || af.pinned) continue;
    const values = new Set(worlds.map((t) => t[id]));
    if (values.size === af.values.length) worlds = worlds.filter((t) => t[id] === p);
  }
  if (worlds.length === 0) return { kind: 'undetermined' };
  const dests = new Set(worlds.map((t) => judge(t, ctx).dest));
  if (dests.size !== 1) return { kind: 'undetermined' };
  return { kind: 'determined', dest: [...dests][0] as Destination };
}
