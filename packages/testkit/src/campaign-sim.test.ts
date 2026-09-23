import { describe, expect, it } from 'vitest';
import { JUDGING, simulateCampaign } from './campaign-sim';
import { loadContent } from './content';

// A PR-sized economy check; `pnpm sim campaign --seeds 200` is the nightly size.
describe('the campaign economy', () => {
  const [competent, careless] = [
    JUDGING.find((j) => j.name === 'competent'),
    JUDGING.find((j) => j.name === 'careless'),
  ];

  it('keeps honest accounts, carries a careful player, and sinks a careless one', () => {
    if (!competent || !careless) throw new Error('missing bot');
    const [good, bad] = simulateCampaign(loadContent('dev-full'), 40, [competent, careless], ['payAll']);
    expect(good?.ledgerErrors).toBe(0);
    expect(bad?.ledgerErrors).toBe(0);
    expect(good).toMatchObject({ demoted: 0, familyLost: 0 });
    expect(good?.meanUpgrades).toBeGreaterThanOrEqual(2);
    expect(bad?.demoted).toBeGreaterThan(0);
  }, 120_000);

  it('never demotes a novice during the demo’s three days', () => {
    const novice = JUDGING.find((j) => j.name === 'novice');
    if (!novice) throw new Error('missing bot');
    const [r] = simulateCampaign(loadContent('web-demo'), 60, [novice], ['payAll']);
    expect(r?.demoted ?? 1).toBeLessThanOrEqual(1);
  }, 120_000);
});
