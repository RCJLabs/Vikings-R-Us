import { expect, it } from 'vitest';
import { loadContent, loadDailyContent } from './content';
import { checkThresholds, sweep } from './sweep';

// The CI gate from docs/tech-spec.md §3.8, on a PR-sized sweep. `pnpm sim sweep --seeds 10000` runs the nightly size.
it('the generator meets its thresholds on 200 seeds x every day', () => {
  const content = loadContent('dev-full');
  const report = sweep({
    content,
    days: content.days.map((d) => d.day),
    seeds: Number(process.env.SWEEP_SEEDS ?? 200),
    seedPrefix: 'ci',
    now: () => performance.now(),
  });
  expect(checkThresholds(report)).toEqual([]);
  expect(report.cases).toBeGreaterThan(1000);
}, 120_000);

it('the Daily meets the same thresholds on Dailies #1-#200', () => {
  const report = sweep({
    content: loadDailyContent(),
    days: [],
    daily: true,
    seeds: Number(process.env.SWEEP_SEEDS ?? 200),
    now: () => performance.now(),
  });
  expect(checkThresholds(report)).toEqual([]);
  expect(report.cases).toBe(8 * Number(process.env.SWEEP_SEEDS ?? 200));
}, 120_000);
