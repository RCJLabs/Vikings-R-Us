import { expect, it } from 'vitest';
import { loadContent } from './content';
import { checkThresholds, sweep } from './sweep';

// The CI gate from docs/tech-spec.md §3.8, on a PR-sized sweep. `pnpm sim sweep --seeds 10000` runs the nightly size.
it('the generator meets its thresholds on 200 seeds x days 1-5', () => {
  const report = sweep({
    content: loadContent('dev-full'),
    days: [1, 2, 3, 4, 5],
    seeds: Number(process.env.SWEEP_SEEDS ?? 200),
    seedPrefix: 'ci',
    now: () => performance.now(),
  });
  expect(checkThresholds(report)).toEqual([]);
  expect(report.cases).toBeGreaterThan(1000);
}, 120_000);
