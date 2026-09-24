import type { ArchetypeDef, Destination, Knobs } from '../content/types';
import { DESTINATIONS } from '../content/types';
import type { DayCtx } from '../logic/context';
import { type Judgment, judge } from '../logic/judge';
import type { Truth } from '../logic/pred';
import { Rng } from '../rng/rng';
import { type PlannedLie, pickLies, withLiars } from './lies';
import { makeLook } from './look';
import { ceilDiv, weightedPick } from './pick';
import { planRavens, planSpeech, planTally, render, type Voice } from './render';
import { sampleTruth } from './sample';
import type { CaseMeta, CaseSpec, Evidence, Field, GenAttempt, GenLog, Look, RejectCode } from './types';
import { decisiveFacts, validateCase } from './validate';

type TierId = 'strict' | 'widenBand' | 'anyArchetype' | 'retarget';
const TIERS: readonly { readonly id: TierId; readonly n: number }[] = [
  { id: 'strict', n: 24 },
  { id: 'widenBand', n: 12 },
  { id: 'anyArchetype', n: 12 },
  { id: 'retarget', n: 8 },
];

/** Whether today has a fact that tracks lying (Day 16's liars). */
const hasLiars = (ctx: DayCtx): boolean => [...ctx.facts.values()].some((af) => af.def.fromLies && !af.pinned);

/** Which destinations each archetype can reach today, from a fixed sample (cached per context). */
const reachCache = new WeakMap<DayCtx, Map<string, Set<Destination>>>();
export function reachOf(ctx: DayCtx): Map<string, Set<Destination>> {
  const cached = reachCache.get(ctx);
  if (cached) return cached;
  const out = new Map<string, Set<Destination>>();
  for (const { def } of ctx.queueArchetypes) {
    const dests = new Set<Destination>();
    const rng = new Rng(`${ctx.content.genVersion}|reach|${ctx.day}|${def.id}`);
    for (let i = 0; i < 48; i++) {
      const s = sampleTruth(def, ctx, rng);
      if (!s.ok) continue;
      // Where lying decides the hall (Day 16 on), a liar's hall counts too.
      const lies = hasLiars(ctx) ? pickLies(def, s.truth, ctx, ctx.spec.queue.knobs, rng.fork(`lies${i}`)) : [];
      dests.add(judge(withLiars(s.truth, lies, ctx), ctx).dest);
    }
    out.set(def.id, dests);
  }
  reachCache.set(ctx, out);
  return out;
}

function pickArchetype(
  ctx: DayCtx,
  target: Destination,
  tier: TierId,
  rng: Rng,
  teach: string | undefined,
): ArchetypeDef | null {
  const reach = reachOf(ctx);
  if (teach && tier === 'strict') {
    const def = ctx.archetypes.get(teach);
    if (def && reach.get(teach)?.has(target)) return def;
  }
  const loose = tier === 'anyArchetype' || tier === 'retarget';
  const options = ctx.queueArchetypes.filter(({ def }) => loose || reach.get(def.id)?.has(target));
  if (options.length === 0) return null;
  return weightedPick(
    options.map((o) => o.def),
    options.map((o) => o.w),
    rng,
  );
}

/** The knobs a tier validates against: later tiers relax the effort band and visibility floor. */
export function tierKnobs(tier: string, knobs: Knobs): Knobs {
  if (tier === 'strict') return knobs;
  return { ...knobs, proofCostS: [0, 999], salienceFloor: 1 };
}

export interface GenerateOptions {
  /** Archetype to try first (the day's teaching soul). */
  readonly teach?: string;
  /** Replaces the cosmetic look stream (metamorphic tests). */
  readonly lookSeed?: string;
  /** Overrides the day's knobs (fallback construction, adversarial tests). */
  readonly knobs?: Knobs;
}

export interface Generated {
  readonly case: CaseSpec;
  readonly log: GenLog;
}

function attemptCase(
  runSeed: string,
  ctx: DayCtx,
  procIndex: number,
  target: Destination,
  tier: TierId,
  attempt: number,
  opts: GenerateOptions,
  daySeed: string = runSeed,
): { case: CaseSpec } | { code: RejectCode; detail: string; archetype: string | null } {
  const gen = ctx.content.genVersion;
  const seed = `${gen}|${runSeed}|${ctx.day}|${procIndex}|${tier}|${attempt}`;
  const rng = new Rng(seed);
  const knobs = tierKnobs(tier, opts.knobs ?? ctx.spec.queue.knobs);

  const arch = pickArchetype(ctx, target, tier, rng.fork('arch'), opts.teach);
  if (!arch) return { code: 'NO_ARCHETYPE', detail: `nothing reaches ${target}`, archetype: null };
  const sampled = sampleTruth(arch, ctx, rng.fork('truth'));
  if (!sampled.ok) return { code: 'TRUTH_UNSAT', detail: sampled.why, archetype: arch.id };
  // Lies are planned before judging: from Day 16 whether the soul lies is part of its truth.
  const planned = pickLies(arch, sampled.truth, ctx, knobs, rng.fork('lies'));
  const truth = withLiars(sampled.truth, planned, ctx);
  const expected = judge(truth, ctx);
  if (tier !== 'retarget' && expected.dest !== target) {
    return { code: 'DEST_MISMATCH', detail: `${expected.dest} instead of ${target}`, archetype: arch.id };
  }

  const look = makeLook(truth, ctx, runSeed, procIndex, opts.lookSeed);
  const voice: Voice = { deck: `${gen}|${daySeed}|${ctx.day}|lines`, index: procIndex };
  const dressed = dressCase(arch, truth, expected, planned, look, [], ctx, knobs, rng, voice);
  if ('code' in dressed) return { ...dressed, archetype: arch.id };
  return {
    case: {
      id: `${runSeed}:${ctx.day}:${procIndex}`,
      day: ctx.day,
      procIndex,
      archetype: arch.id,
      truth,
      lies: dressed.lies,
      evidence: dressed.evidence,
      expect: expected,
      meta: { seed, tier, ...dressed.meta },
    },
  };
}

/**
 * Everything after the truth and its lies: speech, ravens and cues, the
 * rendered evidence (plus any scripted `lines`), and the F1-F8 validator.
 * Shared by generated and scripted souls so both meet the same contract.
 * `voice` is the soul's place in its day, used when the day spreads its lines.
 */
export function dressCase(
  arch: ArchetypeDef,
  truth: Truth,
  expected: Judgment,
  planned: readonly PlannedLie[],
  look: Look,
  lines: readonly string[],
  ctx: DayCtx,
  knobs: Knobs,
  rng: Rng,
  voice?: Voice,
):
  | (Pick<CaseSpec, 'lies' | 'evidence'> & { meta: Omit<CaseMeta, 'seed' | 'tier'> })
  | { code: RejectCode; detail: string } {
  const decisive = decisiveFacts(truth, expected, ctx);
  const planRng = rng.fork('plan');
  const persona = planRng.pick(arch.personas);
  const speech = planSpeech(truth, planned, ctx, planRng);
  const ravens = planRavens(truth, decisive, ctx, knobs, planRng);
  const tally = planTally(truth, planned, decisive, ctx, knobs, rng.fork('tally'));
  const cues = ctx.cues.flatMap((c) => {
    if ('forgery' in c.hint) {
      // Only a soul carrying a tally can show one that looks off.
      if (!tally) return [];
      if (tally.tell) return [{ key: c.key, decoy: false }];
    } else if (truth[c.hint.fact] === c.hint.value) return [{ key: c.key, decoy: false }];
    return planRng.chance(knobs.decoyRate, 100) ? [{ key: c.key, decoy: true }] : [];
  });
  const rendered = render(
    {
      truth,
      lies: planned,
      speech,
      ravens,
      cues,
      look,
      persona,
      tally,
      ...(knobs.spreadLines && voice ? { voice } : {}),
    },
    ctx,
    rng.fork('dialog'),
  );
  if (rendered.unspoken > 0) return { code: 'LIE_UNSPOKEN', detail: 'no template for a lie' };
  const evidence = lines.length > 0 ? withLines(rendered.evidence, lines) : rendered.evidence;

  const v = validateCase(evidence, truth, rendered.lies, expected, decisive, ctx, knobs);
  if (!v.ok) return { code: v.code, detail: v.detail };
  return {
    lies: rendered.lies,
    evidence,
    meta: {
      attempts: 0,
      fallback: false,
      decisive,
      proof: v.proof.fields,
      proofCostS: v.proof.costS,
      difficulty: v.difficulty,
      decoys: rendered.decoys,
    },
  };
}

/** Scripted lines join the soul's testimony after its generated lines. */
function withLines(evidence: Evidence, lines: readonly string[]): Evidence {
  const said = evidence.fields.filter((f) => f.item === 'testimony').length;
  const extra: Field[] = lines.map((msg, i) => ({
    id: `testimony.${said + i}`,
    item: 'testimony',
    salience: 3,
    cost: 2,
    text: { msg, params: { name: evidence.look.name, patronym: evidence.look.patronym, gender: evidence.look.gender } },
  }));
  let at = evidence.fields.length;
  evidence.fields.forEach((f, i) => {
    if (f.item === 'testimony') at = i + 1;
  });
  const fields = evidence.fields.slice();
  fields.splice(at, 0, ...extra);
  return { ...evidence, fields };
}

/**
 * Generates one soul. A pure function of (seed, day, index, target): it tries
 * archetype-targeted attempts in widening tiers and falls back to a plain,
 * honest soul (logged) if every attempt is rejected.
 */
export function generateCase(
  runSeed: string,
  ctx: DayCtx,
  procIndex: number,
  target: Destination,
  opts: GenerateOptions = {},
): Generated {
  const attempts: GenAttempt[] = [];
  for (const tier of TIERS) {
    for (let a = 0; a < tier.n; a++) {
      const r = attemptCase(runSeed, ctx, procIndex, target, tier.id, a, opts);
      if ('case' in r) {
        attempts.push({ tier: tier.id, attempt: a, archetype: r.case.archetype, code: 'ACCEPTED' });
        const c: CaseSpec = { ...r.case, meta: { ...r.case.meta, attempts: attempts.length } };
        return { case: c, log: { day: ctx.day, procIndex, target, attempts, fallback: false } };
      }
      attempts.push({ tier: tier.id, attempt: a, archetype: r.archetype, code: r.code, detail: r.detail });
    }
  }
  const fb = fallbackCase(runSeed, ctx, procIndex, target, opts);
  return { case: fb, log: { day: ctx.day, procIndex, target, attempts, fallback: true } };
}

/** An honest soul with no lies, ravens or decoys. Throws if even that can't reach the target (a content bug). */
function fallbackCase(
  runSeed: string,
  ctx: DayCtx,
  procIndex: number,
  target: Destination,
  opts: GenerateOptions,
): CaseSpec {
  const base = opts.knobs ?? ctx.spec.queue.knobs;
  const plain: Knobs = { ...base, lieRate: 0, decoyRate: 0, ravenRate: 0, forgetRate: 0 };
  for (let a = 0; a < 256; a++) {
    const r = attemptCase(
      `${runSeed}|fallback`,
      ctx,
      procIndex,
      target,
      'widenBand',
      a,
      { ...opts, knobs: plain },
      runSeed,
    );
    if ('case' in r)
      return { ...r.case, id: `${runSeed}:${ctx.day}:${procIndex}`, meta: { ...r.case.meta, fallback: true } };
  }
  throw new Error(`No fallback soul reaches ${target} on day ${ctx.day}`);
}

export interface DayPlan {
  readonly count: number;
  readonly targets: readonly Destination[];
  readonly teach?: string;
  /** Scripted days: the archetype for each slot. */
  readonly script?: readonly string[];
  /** Problems the day-level checks could not fix (logged, not fatal). */
  readonly softFails: readonly string[];
}

function longestRun(targets: readonly Destination[]): number {
  let best = 0;
  let run = 0;
  for (let i = 0; i < targets.length; i++) {
    run = i > 0 && targets[i] === targets[i - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** The day's queue: how many souls and which destination each one targets (a shuffled bag). */
export function planDay(runSeed: string, ctx: DayCtx): DayPlan {
  const script = ctx.spec.queue.script;
  if (script) {
    return { count: script.length, targets: script.map((s) => s.dest), script: script.map((s) => s.id), softFails: [] };
  }
  const rng = new Rng(`${ctx.content.genVersion}|${runSeed}|${ctx.day}|day`);
  const { count, mix, teachFirst } = ctx.spec.queue;
  const n = rng.int(count[0], count[1]);
  const softFails: string[] = [];

  const dests = DESTINATIONS.filter((d) => mix[d] !== undefined && ctx.destinations.has(d));
  const counts = new Map<Destination, number>();
  let used = 0;
  for (const d of dests) {
    const [lo] = mix[d] as readonly [number, number];
    const c = ceilDiv(n * lo, 100);
    counts.set(d, c);
    used += c;
  }
  if (used > n) softFails.push(`mix minimums need ${used} souls but the day has ${n}`);
  for (let i = used; i < n; i++) {
    const open = dests.filter(
      (d) => (counts.get(d) ?? 0) < Math.floor((n * ((mix[d] as readonly [number, number])[1] ?? 0)) / 100),
    );
    const pool = open.length > 0 ? open : dests;
    const d = weightedPick(
      pool,
      pool.map((x) => {
        const [lo, hi] = mix[x] as readonly [number, number];
        return Math.max(1, hi - lo);
      }),
      rng,
    );
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }

  const bag: Destination[] = [];
  for (const d of dests) for (let i = 0; i < (counts.get(d) ?? 0); i++) bag.push(d);
  let targets = rng.shuffle(bag).slice(0, n);
  for (let i = 0; i < 20 && longestRun(targets) > 3; i++) targets = rng.shuffle(targets);
  if (longestRun(targets) > 3) softFails.push('more than 3 souls in a row share a destination');

  if (teachFirst) {
    const reach = reachOf(ctx).get(teachFirst);
    const j = targets.findIndex((d) => reach?.has(d));
    if (j > 0) {
      const t = targets.slice();
      const first = t[0] as Destination;
      t[0] = t[j] as Destination;
      t[j] = first;
      targets = t;
    } else if (j < 0) softFails.push(`the teaching archetype ${teachFirst} has no slot today`);
  }
  return { count: n, targets, ...(teachFirst ? { teach: teachFirst } : {}), softFails };
}

/** The archetype a slot is meant to teach, if any: the script's, or the day's first-soul teacher. */
function teachFor(plan: DayPlan, procIndex: number): string | undefined {
  return plan.script?.[procIndex] ?? (procIndex === 0 ? plan.teach : undefined);
}

/** The case at position `procIndex` of the day, exactly as generateDay would produce it. */
export function generateCaseAt(runSeed: string, ctx: DayCtx, procIndex: number, opts: GenerateOptions = {}): Generated {
  const plan = planDay(runSeed, ctx);
  const target = plan.targets[procIndex];
  if (!target) throw new RangeError(`Day ${ctx.day} has no soul ${procIndex}`);
  const teach = teachFor(plan, procIndex);
  return generateCase(runSeed, ctx, procIndex, target, { ...opts, ...(teach ? { teach } : {}) });
}

export interface GeneratedDay {
  readonly plan: DayPlan;
  readonly cases: readonly CaseSpec[];
  readonly logs: readonly GenLog[];
}

export function generateDay(runSeed: string, ctx: DayCtx): GeneratedDay {
  const plan = planDay(runSeed, ctx);
  const cases: CaseSpec[] = [];
  const logs: GenLog[] = [];
  plan.targets.forEach((target, i) => {
    const teach = teachFor(plan, i);
    const g = generateCase(runSeed, ctx, i, target, teach ? { teach } : {});
    cases.push(g.case);
    logs.push(g.log);
  });
  return { plan, cases, logs };
}
