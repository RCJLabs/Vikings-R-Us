import { weaveDay } from '@cots/engine';
import { expect, it } from 'vitest';
import { loadContent, loadDailyContent } from './content';
import { checkThresholds, sweep, THRESHOLDS } from './sweep';

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

// Under each weave (docs/tech-spec.md §53) the day's souls are made as above and seen under its order: the generator's
// figures are the same, so these check what the weave changes. `pnpm sim sweep --weave <id>` runs the nightly size.
it('every soul made on a woven day can be dressed for the weave, and the careful bot judges it rightly', () => {
  const content = loadContent('dev-full');
  for (const weave of content.campaign?.weaving?.weaves ?? []) {
    const first = weaveDay(content, weave) ?? content.days.length + 1;
    const report = sweep({
      content,
      days: content.days.map((d) => d.day).filter((d) => d >= first),
      seeds: Number(process.env.SWEEP_WOVEN_SEEDS ?? 30),
      seedPrefix: 'ci-woven',
      weave,
    });
    expect(report.undressed, weave.id).toBe(0);
    expect(report.ideal.correct, weave.id).toBe(report.ideal.total);
    expect((report.trusting.correct * 100) / report.trusting.total, weave.id).toBeLessThanOrEqual(
      THRESHOLDS.maxTrustingPct,
    );
  }
}, 120_000);
