import { reachableEndings } from '@cots/engine';
import { describe, expect, it } from 'vitest';
import { JUDGING, type Judging, type NightStrategy, simulateCampaign, simulateRun, storyPolicy } from './campaign-sim';
import { loadContent, loadScenes } from './content';

const bot = (name: string): Judging => {
  const j = JUDGING.find((x) => x.name === name);
  if (!j) throw new Error(`missing bot ${name}`);
  return j;
};

// A PR-sized economy check; `pnpm sim campaign --seeds 200` is the nightly size.
describe('the campaign economy', () => {
  it('keeps honest accounts, carries a careful player, and sinks a careless one', () => {
    const scenes = loadScenes('dev-full');
    const [good, bad] = simulateCampaign(
      loadContent('dev-full'),
      24,
      [bot('competent'), bot('careless')],
      ['payAll'],
      [storyPolicy('plain')],
      scenes,
    );
    expect(good?.ledgerErrors).toBe(0);
    expect(bad?.ledgerErrors).toBe(0);
    expect(good).toMatchObject({ demoted: 0, familyLost: 0 });
    expect(good?.meanUpgrades).toBeGreaterThanOrEqual(2);
    expect(bad?.demoted).toBeGreaterThan(0);
  }, 120_000);

  it('never demotes a novice during the demo’s three days', () => {
    const [r] = simulateCampaign(loadContent('web-demo'), 60, [bot('novice')], ['payAll']);
    expect(r?.demoted ?? 1).toBeLessThanOrEqual(1);
  }, 120_000);
});

// docs/build-plan.md §10: bots must reach every ending. Each ending names a player who should reach
// it; the first of a few seeds that does is enough.
const REACH: readonly [ending: string, judging: string, night: NightStrategy, story: string][] = [
  ['ending.demoted', 'careless', 'payAll', 'plain'],
  ['ending.alone', 'novice', 'neglect', 'plain'],
  ['ending.naglfar', 'expert', 'payAll', 'naglfar'],
  ['ending.rebirth', 'expert', 'payAll', 'rebirth'],
  ['ending.smuggled', 'competent', 'payAll', 'ferry'],
  ['ending.transfer', 'expert', 'payAll', 'transfer'],
  ['ending.hel', 'expert', 'payAll', 'hel'],
  ['ending.freyja', 'expert', 'payAll', 'freyja'],
  ['ending.odin', 'expert', 'payAll', 'odin'],
  ['ending.wolf', 'novice', 'frugal', 'plain'],
  ['ending.lastStand', 'competent', 'payAll', 'plain'],
];

describe('the endings', () => {
  it('can each be reached by a bot that plays for it, and so can what the campaign alone can earn', () => {
    const content = loadContent('dev-full');
    const scenes = loadScenes('dev-full');
    const achievements = content.achievements ?? [];
    const missed: string[] = [];
    const earned = new Set<string>();
    for (const [ending, judging, night, story] of REACH) {
      const seen: string[] = [];
      for (let i = 0; i < 6 && !seen.includes(ending); i++) {
        const r = simulateRun(content, `reach${i}`, bot(judging), night, {
          story: storyPolicy(story),
          scenes,
          achievements,
        });
        seen.push(r.ending ?? 'none');
        for (const id of r.achievements) earned.add(id);
      }
      if (!seen.includes(ending)) missed.push(`${ending} (${judging}, ${night}, ${story}): got ${seen.join(', ')}`);
    }
    expect(missed).toEqual([]);
    // docs/tech-spec.md §34: every achievement of the run, its endings and its shifts alone, a bot earns too.
    // (Those any mode can earn are shown earnable in the engine's tests, on the Daily.)
    const campaignOnly = achievements.filter(
      (a) =>
        a.when.at === 'run' ||
        a.when.at === 'ending' ||
        (a.when.at === 'shift' && a.when.modes.every((m) => m === 'campaign')),
    );
    expect(campaignOnly.length).toBeGreaterThan(0);
    expect(campaignOnly.map((a) => a.id).filter((id) => !earned.has(id))).toEqual([]);
  }, 300_000);

  it('covers every ending the full campaign can end on', () => {
    // Endings with a condition, and the finale; the demo's and the slice's finales end other runs.
    const ids = reachableEndings(loadContent('dev-full')).map((e) => e.id);
    expect(new Set(REACH.map(([e]) => e))).toEqual(new Set(ids));
  });
});
