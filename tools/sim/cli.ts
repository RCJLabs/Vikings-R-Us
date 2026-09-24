/**
 * Generator sweeps and campaign simulations (docs/tech-spec.md §9-10).
 *   pnpm sim sweep [--seeds 200] [--days 1-11] [--prefix sweep] [--no-timing]   (default: every day with a spec)
 *   pnpm sim sweep --daily [--seeds 200]      Dailies #1..#seeds
 *   pnpm sim campaign [--seeds 200] [--target dev-full|web-demo] [--story plain,ferry,…|all] [--no-fines]
 *     Bots play the target's scenes with each story policy (plain by default; see STORY_POLICIES);
 *     --no-fines plays every shift with that assist on.
 * Sweeps print a report and exit 1 if any CI threshold is breached.
 */
import type { TargetId } from '@cots/content-schema';
import {
  checkThresholds,
  JUDGING,
  loadContent,
  loadDailyContent,
  loadScenes,
  STORY_POLICIES,
  simulateCampaign,
  storyPolicy,
  sweep,
  THRESHOLDS,
} from '@cots/testkit';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const [cmd] = process.argv.slice(2);
if (cmd === 'campaign') {
  const target = arg('target', 'dev-full') as TargetId;
  const seeds = Number(arg('seeds', '200'));
  const story = arg('story', 'plain');
  const stories = story === 'all' ? STORY_POLICIES : story.split(',').map(storyPolicy);
  const started = performance.now();
  const strategies = ['payAll', 'frugal', 'upgradesFirst'] as const;
  const noFines = process.argv.includes('--no-fines');
  const reports = simulateCampaign(
    loadContent(target),
    seeds,
    JUDGING,
    strategies,
    stories,
    loadScenes(target),
    noFines ? { noFines: true } : undefined,
  );
  console.log(
    `campaign sim: ${target}, ${seeds} runs per policy${noFines ? ', no fines' : ''}, ${((performance.now() - started) / 1000).toFixed(1)}s`,
  );
  console.log(
    'judging    night          story      demoted  family lost  rings (mean / min)  upgrades   host  endings',
  );
  for (const r of reports) {
    const pct = (n: number) => `${((n * 100) / r.runs).toFixed(1)}%`.padStart(6);
    console.log(
      [
        r.judging.padEnd(10),
        r.strategy.padEnd(14),
        r.story.padEnd(10),
        pct(r.demoted).padStart(7),
        pct(r.familyLost).padStart(11),
        `${r.meanRings.toFixed(1)} / ${r.minRings}`.padStart(18),
        r.meanUpgrades.toFixed(1).padStart(9),
        r.meanRagnarok.toFixed(0).padStart(6),
        ` ${Object.entries(r.endings)
          .map(([e, n]) => `${e.replace('ending.', '')} ${n}`)
          .join(', ')}`,
      ].join(' '),
    );
    if (r.ledgerErrors > 0) console.log(`  !! ${r.ledgerErrors} runs whose accounts don't add up`);
  }
  process.exit(reports.some((r) => r.ledgerErrors > 0) ? 1 : 0);
}
if (cmd !== 'sweep') {
  console.error(
    'Usage: pnpm sim sweep [--seeds N] [--days 1-11 | --daily] [--prefix P] [--no-timing] | pnpm sim campaign [--seeds N] [--story plain,…|all]',
  );
  process.exit(2);
}
// Every day with a spec by default; a range keeps only the days that have one.
const specced = loadContent('dev-full').days.map((d) => d.day);
const range = process.argv.includes('--days')
  ? (arg('days', '1-5').split('-').map(Number) as [number, number])
  : ([Math.min(...specced), Math.max(...specced)] as [number, number]);
const days = specced.filter((d) => d >= range[0] && d <= (range[1] ?? range[0]));
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
