/**
 * Generator sweeps (docs/tech-spec.md §10).
 *   pnpm sim sweep [--seeds 200] [--days 1-5] [--prefix sweep] [--no-timing]
 *   pnpm sim sweep --daily [--seeds 200]      Dailies #1..#seeds
 * Prints a report and exits 1 if any CI threshold is breached.
 */
import { checkThresholds, loadContent, loadDailyContent, sweep, THRESHOLDS } from '@cots/testkit';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const [cmd] = process.argv.slice(2);
if (cmd !== 'sweep') {
  console.error('Usage: pnpm sim sweep [--seeds N] [--days 1-5 | --daily] [--prefix P] [--no-timing]');
  process.exit(2);
}
const [lo, hi] = arg('days', '1-5').split('-').map(Number) as [number, number];
const days = Array.from({ length: (hi ?? lo) - lo + 1 }, (_, i) => lo + i);
const seeds = Number(arg('seeds', '200'));
const timing = !process.argv.includes('--no-timing');
const daily = process.argv.includes('--daily');

const started = performance.now();
const r = sweep({
  content: daily ? loadDailyContent() : loadContent('dev-full'),
  days,
  daily,
  seeds,
  seedPrefix: arg('prefix', 'sweep'),
  now: () => performance.now(),
});
const pct = (a: number, b: number) => (b ? ((a * 100) / b).toFixed(1) : '0.0');

console.log(
  `sweep: ${daily ? `Dailies #1-#${seeds}` : `${seeds} seeds x days ${days.join(',')}`} = ${r.cases} souls in ${((performance.now() - started) / 1000).toFixed(1)}s`,
);
console.log(
  `attempts: mean ${r.attemptsMean.toFixed(2)}, p99 ${r.attemptsP99}; fallbacks ${r.fallbacks} (${pct(r.fallbacks, r.cases)}%)`,
);
console.log(`generation: mean ${r.genMsMean.toFixed(3)} ms, p99 ${r.genMsP99.toFixed(3)} ms`);
console.log(`mix within spec: ${pct(r.mix.ok, r.mix.days)}% of days`);
console.log(
  `bots: ideal ${pct(r.ideal.correct, r.ideal.total)}%, trusting ${pct(r.trusting.correct, r.trusting.total)}% (max ${THRESHOLDS.maxTrustingPct}%)`,
);
console.log(
  `trusting by day: ${Object.entries(r.trustingByDay)
    .map(([d, v]) => `${/^\d+$/.test(d) ? `d${d}` : d} ${pct(v.correct, v.total)}%`)
    .join(', ')}`,
);
console.log(
  `destinations: ${Object.entries(r.destinations)
    .map(([d, n]) => `${d} ${pct(n, r.cases)}%`)
    .join(', ')}`,
);
console.log('acceptance by day:archetype:');
for (const [key, row] of Object.entries(r.perDayArchetype).sort()) {
  console.log(`  ${key.padEnd(28)} ${pct(row.accepted, row.attempts).padStart(5)}% of ${row.attempts}`);
}
console.log(
  `rejections: ${
    Object.entries(r.rejects)
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c} ${n}`)
      .join(', ') || 'none'
  }`,
);

const violations = checkThresholds(r, { timing });
if (violations.length > 0) {
  console.error(violations.map((v) => `sweep: FAIL ${v}`).join('\n'));
  process.exit(1);
}
console.log('sweep: all thresholds met');
