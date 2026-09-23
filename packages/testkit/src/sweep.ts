import {
  type Content,
  createDayContext,
  type DayCtx,
  type Destination,
  dailySeed,
  generateCase,
  planDay,
  revealsOf,
  solve,
} from '@cots/engine';

export interface SweepOptions {
  readonly content: Content;
  readonly days: readonly number[];
  readonly seeds: number;
  readonly seedPrefix?: string;
  /** Sweep Dailies #1..#seeds with the content's Daily spec instead of `days`. */
  readonly daily?: boolean;
  /** Clock for per-case timing (the engine itself never reads one). */
  readonly now?: () => number;
}

export interface SweepReport {
  readonly cases: number;
  readonly perDayArchetype: Record<string, { attempts: number; accepted: number }>;
  readonly attemptsMean: number;
  readonly attemptsP99: number;
  readonly fallbacks: number;
  readonly genMsMean: number;
  readonly genMsP99: number;
  readonly mix: { readonly ok: number; readonly days: number };
  readonly ideal: { readonly correct: number; readonly total: number };
  readonly trusting: { readonly correct: number; readonly total: number };
  /** Keyed by day number, or `daily`. */
  readonly trustingByDay: Record<string, { correct: number; total: number }>;
  readonly rejects: Record<string, number>;
  readonly destinations: Record<string, number>;
}

const percentile = (xs: number[], p: number): number => {
  if (xs.length === 0) return 0;
  const sorted = xs.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))] ?? 0;
};

/** Generates `seeds` full days for each day and measures the generator and two bots. */
export function sweep(opts: SweepOptions): SweepReport {
  const now = opts.now ?? (() => 0);
  const perDayArchetype: Record<string, { attempts: number; accepted: number }> = {};
  const attempts: number[] = [];
  const times: number[] = [];
  const rejects: Record<string, number> = {};
  const destinations: Record<string, number> = {};
  const trustingByDay: Record<string, { correct: number; total: number }> = {};
  let fallbacks = 0;
  let cases = 0;
  let mixOk = 0;
  let mixDays = 0;
  let idealOk = 0;
  let trustOk = 0;

  const daily = opts.content.daily;
  if (opts.daily && !daily) throw new Error('This content has no Daily spec');
  const runs: { label: string; make: (s: number) => { seed: string; ctx: DayCtx } }[] =
    opts.daily && daily
      ? [
          {
            label: 'daily',
            make: (s) => {
              const seed = dailySeed(s + 1);
              return { seed, ctx: createDayContext(opts.content, daily.day, seed, daily) };
            },
          },
        ]
      : opts.days.map((day) => ({
          label: String(day),
          make: (s) => {
            const seed = `${opts.seedPrefix ?? 'sweep'}-${s}`;
            return { seed, ctx: createDayContext(opts.content, day, seed) };
          },
        }));

  for (const { label, make } of runs) {
    const byDay = { correct: 0, total: 0 };
    trustingByDay[label] = byDay;
    for (let s = 0; s < opts.seeds; s++) {
      const { seed, ctx } = make(s);
      const plan = planDay(seed, ctx);
      const counts: Partial<Record<Destination, number>> = {};
      plan.targets.forEach((target, i) => {
        const gen = () => generateCase(seed, ctx, i, target, i === 0 && plan.teach ? { teach: plan.teach } : {});
        const t0 = now();
        const g = gen();
        let ms = now() - t0;
        // Re-time a case over budget and keep its fastest run: a slow case is slow every time, while a
        // busy machine (tests run in parallel) only slows some runs.
        for (let r = 0; r < RETIMES && ms > THRESHOLDS.maxGenMsP99; r++) {
          const t1 = now();
          gen();
          ms = Math.min(ms, now() - t1);
        }
        times.push(ms);
        cases++;
        attempts.push(g.log.attempts.length);
        if (g.log.fallback) fallbacks++;
        for (const a of g.log.attempts) {
          if (!a.archetype) continue;
          const key = `${label}:${a.archetype}`;
          const row = perDayArchetype[key] ?? { attempts: 0, accepted: 0 };
          row.attempts++;
          if (a.code === 'ACCEPTED') row.accepted++;
          perDayArchetype[key] = row;
          if (a.code !== 'ACCEPTED') rejects[a.code] = (rejects[a.code] ?? 0) + 1;
        }
        const c = g.case;
        destinations[c.expect.dest] = (destinations[c.expect.dest] ?? 0) + 1;
        counts[c.expect.dest] = (counts[c.expect.dest] ?? 0) + 1;

        const ideal = solve(c.evidence.fields, ctx, { reveals: revealsOf(c.lies) }).judgment;
        if (ideal.kind === 'determined' && ideal.dest === c.expect.dest) idealOk++;
        const trusting = solve(c.evidence.fields, ctx, { trustTestimony: true }).judgment;
        byDay.total++;
        if (trusting.kind === 'determined' && trusting.dest === c.expect.dest) {
          trustOk++;
          byDay.correct++;
        }
      });
      mixDays++;
      const n = plan.targets.length;
      const within = Object.entries(ctx.spec.queue.mix).every(([d, range]) => {
        const got = counts[d as Destination] ?? 0;
        const [lo, hi] = range as readonly [number, number];
        return got * 100 >= Math.floor((n * lo) / 100) * 100 && got * 100 <= n * hi + 100;
      });
      if (within) mixOk++;
    }
  }

  const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    cases,
    perDayArchetype,
    attemptsMean: meanOf(attempts),
    attemptsP99: percentile(attempts, 99),
    fallbacks,
    genMsMean: meanOf(times),
    genMsP99: percentile(times, 99),
    mix: { ok: mixOk, days: mixDays },
    ideal: { correct: idealOk, total: cases },
    trusting: { correct: trustOk, total: cases },
    trustingByDay,
    rejects,
    destinations,
  };
}

/** CI gates for the generator (docs/tech-spec.md §3.8). */
/** Extra timings for a case over the time budget (see sweep). */
const RETIMES = 3;

export const THRESHOLDS = {
  minAcceptancePct: 30,
  /** Only judge acceptance for (day, archetype) pairs with at least this many attempts. */
  minAttemptsForAcceptance: 50,
  maxAttemptsMean: 3,
  maxAttemptsP99: 15,
  maxFallbackPct: 0.05,
  maxGenMsP99: 5,
  minMixPct: 99,
  maxTrustingPct: 65,
} as const;

export function checkThresholds(r: SweepReport, opts: { timing: boolean } = { timing: true }): string[] {
  const out: string[] = [];
  for (const [key, row] of Object.entries(r.perDayArchetype)) {
    if (row.attempts < THRESHOLDS.minAttemptsForAcceptance) continue;
    const pct = (row.accepted * 100) / row.attempts;
    if (pct < THRESHOLDS.minAcceptancePct) out.push(`acceptance ${key} is ${pct.toFixed(1)}%`);
  }
  if (r.attemptsMean > THRESHOLDS.maxAttemptsMean) out.push(`mean attempts ${r.attemptsMean.toFixed(2)}`);
  if (r.attemptsP99 > THRESHOLDS.maxAttemptsP99) out.push(`p99 attempts ${r.attemptsP99}`);
  const fb = r.cases ? (r.fallbacks * 100) / r.cases : 0;
  if (fb > THRESHOLDS.maxFallbackPct) out.push(`fallback rate ${fb.toFixed(3)}%`);
  if (opts.timing && r.genMsP99 > THRESHOLDS.maxGenMsP99) out.push(`p99 generation ${r.genMsP99.toFixed(2)} ms`);
  const mix = r.mix.days ? (r.mix.ok * 100) / r.mix.days : 100;
  if (mix < THRESHOLDS.minMixPct) out.push(`destination mix within spec on only ${mix.toFixed(1)}% of days`);
  if (r.ideal.correct !== r.ideal.total) out.push(`ideal bot ${r.ideal.correct}/${r.ideal.total}`);
  const trust = r.cases ? (r.trusting.correct * 100) / r.cases : 0;
  if (trust > THRESHOLDS.maxTrustingPct) out.push(`trusting bot scores ${trust.toFixed(1)}%`);
  return out;
}
