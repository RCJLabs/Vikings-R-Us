import type { Knobs, ObsPattern, ToolId, Value } from '../content/types';
import type { DayCtx } from '../logic/context';
import { type Judgment, judge, observe, withOverride } from '../logic/judge';
import { eval2, type Truth } from '../logic/pred';
import { type SolveResult, solve } from '../logic/solver';
import type { Evidence, Field, Lie, RejectCode } from './types';

/** Facts whose value decides the judgment: changing any one of them changes the destination. */
export function decisiveFacts(truth: Truth, expected: Judgment, ctx: DayCtx): string[] {
  const out: string[] = [];
  for (const id of ctx.sampled) {
    const af = ctx.facts.get(id);
    if (!af || af.pinned) continue;
    if (af.values.some((v) => v !== truth[id] && judge(withOverride(truth, id, v, ctx), ctx).dest !== expected.dest)) {
      out.push(id);
    }
  }
  return out;
}

/** Answers questioning would give: a confession reveals the true value. */
export function revealsOf(lies: readonly Lie[]): Map<string, { fact: string; value: Value }> {
  const out = new Map<string, { fact: string; value: Value }>();
  for (const l of lies) if (l.onQuestion === 'confess') out.set(l.field, { fact: l.fact, value: l.truth });
  return out;
}

export function toolsFor(fields: readonly Field[]): ToolId[] {
  const tools: ToolId[] = [];
  for (const f of fields) {
    const t: ToolId | undefined = f.tool ?? (f.view === 'back' ? 'flip' : undefined);
    if (t && !tools.includes(t)) tools.push(t);
  }
  return tools;
}

export function docsFor(fields: readonly Field[]): number {
  const docs = new Set(fields.map((f) => (f.item === 'huginn' || f.item === 'muninn' ? 'ravens' : f.item)));
  return docs.size;
}

export interface Proof {
  readonly fields: readonly string[];
  readonly costS: number;
  readonly tools: readonly ToolId[];
}

/**
 * The smallest set of fields that still yields the judgment (1-minimal:
 * dropping any single field breaks it). Drives difficulty, timer tuning, the
 * efficient bot and the citation that explains a mistake.
 */
export function minimalProof(evidence: Evidence, lies: readonly Lie[], expected: Judgment, ctx: DayCtx): Proof {
  const reveals = revealsOf(lies);
  const candidates = evidence.fields.filter((f) => f.cue === undefined);
  const order = candidates
    .slice()
    .sort((a, b) => b.cost - a.cost || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((f) => f.id);
  const keep = new Set(candidates.map((f) => f.id));
  for (const id of order) {
    keep.delete(id);
    const r = solve(
      evidence.fields.filter((f) => keep.has(f.id)),
      ctx,
      { reveals },
    ).judgment;
    if (r.kind !== 'determined' || r.dest !== expected.dest) keep.add(id);
  }
  const proofFields = evidence.fields.filter((f) => keep.has(f.id));
  const tools = toolsFor(proofFields);
  let costS = 0;
  for (const f of proofFields) costS += f.cost;
  for (const t of tools) costS += ctx.tools.get(t) ?? 0;
  return { fields: proofFields.map((f) => f.id), costS, tools };
}

export function difficultyOf(proof: Proof, evidence: Evidence, lies: readonly Lie[], expected: Judgment, ctx: DayCtx) {
  const byId = new Map(evidence.fields.map((f) => [f.id, f]));
  const subtle = proof.fields.filter((id) => byId.get(id)?.salience === 1).length;
  const questions = proof.fields.filter((id) => lies.some((l) => l.field === id)).length;
  const depth = Math.max(
    0,
    ctx.rules.findIndex((r) => r.id === expected.rule),
  );
  return proof.costS + 8 * questions + 5 * depth + 6 * subtle + 4 * proof.tools.length + 3 * lies.length;
}

export type Validation =
  | {
      readonly ok: true;
      readonly proof: Proof;
      readonly difficulty: number;
      readonly solved: SolveResult;
    }
  | { readonly ok: false; readonly code: RejectCode; readonly detail: string };

function obsMatches(p: ObsPattern, seen: ReadonlyMap<string, Value>): boolean {
  if ('all' in p) return p.all.every((q) => obsMatches(q, seen));
  const v = seen.get(p.obs);
  if (v === undefined) return false;
  return 'is' in p ? v === p.is : p.in.includes(v);
}

const fail = (code: RejectCode, detail: string): Validation => ({ ok: false, code, detail });

/** The fairness contract, F1–F8 (docs/tech-spec.md §3.2). */
export function validateCase(
  evidence: Evidence,
  truth: Truth,
  lies: readonly Lie[],
  expected: Judgment,
  decisive: readonly string[],
  ctx: DayCtx,
  knobs: Knobs,
): Validation {
  // F8: content rules.
  if (evidence.look.age < 18 || evidence.look.age > 85) return fail('CONTENT_RULE', `age ${evidence.look.age}`);

  // F1: everything that isn't a lie agrees with the truth, under every law on every day.
  const lieFields = new Set(lies.map((l) => l.field));
  const seen = new Map<string, Value>();
  for (const f of evidence.fields) {
    if (f.obs) {
      const def = ctx.observationByKey.get(f.obs.key);
      if (!def || observe(def, truth, ctx) !== f.obs.value) return fail('UNSOUND', `${f.id} misreports the body`);
      seen.set(f.obs.key, f.obs.value);
    }
    if (f.says && f.says.value !== null && !lieFields.has(f.id) && truth[f.says.fact] !== f.says.value) {
      return fail(
        'UNSOUND',
        `${f.id} says ${f.says.fact}=${String(f.says.value)} but it is ${String(truth[f.says.fact])}`,
      );
    }
  }
  for (const law of ctx.content.signLaws) {
    if (obsMatches(law.if, seen) && !law.then.in.includes(truth[law.then.fact] as Value)) {
      return fail('UNSOUND', `sign ${law.id} would mislead`);
    }
  }
  for (const law of ctx.content.factLaws) {
    if (eval2(law.if, truth, ctx) && !law.then.in.includes(truth[law.then.fact] as Value)) {
      return fail('UNSOUND', `custom ${law.id} does not hold`);
    }
  }

  const solved = solve(evidence.fields, ctx, { reveals: revealsOf(lies) });

  // F2: no false alarms.
  if (solved.conflicts.length > 0) return fail('FALSE_ALARM', `conflict on ${solved.conflicts[0]?.fact}`);

  // F3: the player can reach the right judgment.
  const j = solved.judgment;
  if (j.kind !== 'determined') return fail('UNDETERMINED', `${j.rule} blocked by ${j.blocking.join(', ')}`);
  if (j.dest !== expected.dest) return fail('WRONG_DEST', `solver says ${j.dest}, truth says ${expected.dest}`);

  // F4: every lie that would change the outcome is caught by a contradiction.
  for (const lie of lies) {
    const changes = judge(withOverride(truth, lie.fact, lie.claimed, ctx), ctx).dest !== expected.dest;
    if (changes && !solved.contradictions.some((c) => c.lie === lie.field)) {
      return fail('HIDDEN_LIE', `${lie.field} (${lie.fact}) is never contradicted`);
    }
  }

  // F6: a decisive fact that breaks its presumption is positively evidenced, with a tool-free cue if it needs a tool.
  const byId = new Map(evidence.fields.map((f) => [f.id, f]));
  for (const fact of decisive) {
    const def = ctx.facts.get(fact)?.def;
    if (def?.presumption === undefined || truth[fact] === def.presumption) continue;
    const b = solved.beliefs.get(fact);
    if (!b || b.level < 3) return fail('PRESUMPTION_UNSUPPORTED', `${fact} rests on a presumption`);
    const needsTool = b.support.every((id) => {
      const f = byId.get(id);
      return f === undefined || f.tool !== undefined || f.view === 'back';
    });
    if (needsTool) {
      const cued = evidence.fields.some((f) => {
        const cue = f.cue && ctx.cues.find((c) => c.key === f.cue?.key);
        return cue && cue.hint.fact === fact && cue.hint.value === truth[fact] && f.salience >= knobs.salienceFloor;
      });
      if (!cued) return fail('CUE_MISSING', `${fact} needs a tool but nothing hints at it`);
    }
  }

  // F7: effort limits.
  const proof = minimalProof(evidence, lies, expected, ctx);
  const [lo, hi] = knobs.proofCostS;
  if (proof.costS < lo || proof.costS > hi) return fail('EFFORT_BAND', `proof costs ${proof.costS}s`);
  if (proof.tools.length > knobs.maxTools) return fail('TOO_MANY_TOOLS', `${proof.tools.length} tools`);
  const faint = proof.fields.find((id) => (byId.get(id)?.salience ?? 3) < knobs.salienceFloor);
  if (faint) return fail('SALIENCE_FLOOR', `${faint} is too subtle for today`);
  if (docsFor(evidence.fields) > knobs.maxDocs) return fail('TOO_MANY_DOCS', `${docsFor(evidence.fields)} documents`);

  return { ok: true, proof, difficulty: difficultyOf(proof, evidence, lies, expected, ctx), solved };
}
