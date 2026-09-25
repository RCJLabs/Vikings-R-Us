import { FACTIONS, reachableEndings } from '@cots/engine';
import { playScene } from '@cots/story';
import { describe, expect, it } from 'vitest';
import {
  JUDGING,
  type Judging,
  type NightStrategy,
  type SimOptions,
  simulateCampaign,
  simulateRun,
  storyPolicy,
} from './campaign-sim';
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

  it('lets the sun set on a slow bot’s line (docs/tech-spec.md §41): the souls wait, and the accounts still add up', () => {
    const content = loadContent('dev-full');
    for (const seed of ['slow-0', 'slow-1']) {
      const r = simulateRun(content, seed, bot('competent'), 'payAll', { paceS: 70 });
      expect(r.ledgerOk).toBe(true);
      expect(r.leftAtDusk).toBeGreaterThan(0);
      expect(r.ledger.some((l) => (l.waiting?.carried.length ?? 0) > 0)).toBe(true);
      // Standing is every audit's columns added up: mistakes, story, the appeal, the line and the requests (no scenes
      // here, so nothing waits to be filed).
      for (const f of FACTIONS) {
        const sum = r.ledger.reduce(
          (n, l) =>
            n +
            (l.standing[f] ?? 0) +
            (l.story?.[f] ?? 0) +
            (l.appeal?.standing[f] ?? 0) +
            (l.waiting?.standing[f] ?? 0) +
            (l.requests ?? []).reduce((m, q) => m + (q.standing[f] ?? 0), 0),
          0,
        );
        expect(r.standing[f], `${seed} ${f}`).toBe(sum);
      }
    }
  }, 120_000);
});

// docs/build-plan.md §10: bots must reach every ending. Each ending names a player who should reach
// it; the first of a few seeds that does is enough.
const REACH: readonly [
  ending: string,
  judging: string,
  night: NightStrategy,
  story: string,
  options?: Pick<SimOptions, 'appeals' | 'serve' | 'oath'>,
][] = [
  ['ending.demoted', 'careless', 'payAll', 'plain'],
  ['ending.alone', 'novice', 'neglect', 'plain'],
  ['ending.naglfar', 'expert', 'payAll', 'naglfar'],
  ['ending.rebirth', 'expert', 'payAll', 'rebirth'],
  ['ending.smuggled', 'competent', 'payAll', 'ferry'],
  ['ending.transfer', 'expert', 'payAll', 'transfer'],
  // Freyja's and Hel's endings take the story and their requests too (docs/tech-spec.md §42).
  ['ending.hel', 'expert', 'payAll', 'hel', { serve: 'hel' }],
  ['ending.freyja', 'expert', 'payAll', 'freyja', { serve: 'freyja' }],
  // Under the oath (docs/tech-spec.md §49), which its achievement asks for: no warnings before the fines.
  ['ending.odin', 'expert', 'payAll', 'odin', { oath: true }],
  // A weak host: a novice who lets the appeals stand (righting mistakes sends souls where they belong).
  ['ending.wolf', 'novice', 'frugal', 'plain', { appeals: false }],
  ['ending.lastStand', 'competent', 'payAll', 'plain'],
];

describe('the endings', () => {
  it('can each be reached by a bot that plays for it, and so can what the campaign alone can earn', () => {
    const content = loadContent('dev-full');
    const scenes = loadScenes('dev-full');
    const achievements = content.achievements ?? [];
    const missed: string[] = [];
    const earned = new Set<string>();
    for (const [ending, judging, night, story, options] of REACH) {
      const seen: string[] = [];
      for (let i = 0; i < 6 && !seen.includes(ending); i++) {
        const r = simulateRun(content, `reach${i}`, bot(judging), night, {
          story: storyPolicy(story),
          scenes,
          achievements,
          ...options,
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

describe('a jarl’s bribe (docs/tech-spec.md §47)', () => {
  it('is taken only by a bot that takes bribes: paid at the audit as a mistake, and the accounts add up', () => {
    const content = loadContent('dev-full');
    const paid = (bribes: boolean) =>
      simulateRun(content, 'bribe-0', bot('expert'), 'payAll', { bribes }).ledger.flatMap((l) =>
        (l.mistakes ?? []).filter((m) => (m.paid ?? 0) > 0).map((m) => ({ day: l.day, paid: m.paid })),
      );
    expect(paid(false)).toEqual([]);
    const taken = paid(true);
    expect(taken).toHaveLength(1);
    expect(taken[0]?.paid).toBeGreaterThan(0);
    expect(simulateRun(content, 'bribe-0', bot('expert'), 'payAll', { bribes: true }).ledgerOk).toBe(true);
  }, 120_000);

  it('is remembered: the night counts the rings, and Muninn remembers either answer', () => {
    const scenes = loadScenes('dev-full');
    const text = (id: string, day: number, flags: Record<string, number>) => {
      const json = scenes[id];
      if (!json) throw new Error(`no ${id}`);
      const env = {
        seed: 1,
        day,
        rings: 50,
        flags,
        standing: { odin: 0, freyja: 0, hel: 0, loki: 0, clerk: 0 },
        family: { mother: 'well', brother: 'well', sister: 'well' },
      };
      return playScene(json, env, [0, 0])
        .lines.map((l) => l.text)
        .join('\n');
    };
    expect(text('scene.d9.night', 9, { jarl_bribe: 1 })).toContain('the jarl');
    expect(text('scene.d9.night', 9, { jarl_refused: 1 })).not.toContain('the jarl');
    const took = text('scene.d13.night', 13, { jarl_bribe: 1 });
    const refused = text('scene.d13.night', 13, { jarl_refused: 1 });
    expect(took).toContain('I remember a jarl');
    expect(refused).toContain('I remember a jarl');
    expect(took).not.toBe(refused);
    expect(text('scene.d13.night', 13, {})).not.toContain('jarl');
  });
});
