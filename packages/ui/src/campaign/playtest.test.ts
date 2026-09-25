import {
  type CaseSpec,
  type Destination,
  ENGINE_MAJOR,
  type RunAction,
  type RunSave,
  type RunState,
  recordAction,
  resumeSave,
  runContext,
  stampsFor,
  startSave,
  stepRun,
} from '@cots/engine';
import { playScene, sceneEnv } from '@cots/story';
import { loadContent, loadScenes } from '@cots/testkit';
import { describe, expect, it } from 'vitest';
import { playtestReport } from './playtest';

const content = loadContent('dev-full');
const scenes = loadScenes('dev-full');
/** The game's words as their keys, so the tests read the report's frame and the keys it looks up. */
const t = (key: string, vars?: Readonly<Record<string, string | number>>) =>
  vars ? `${key}${JSON.stringify(vars)}` : key;

const report = (save: RunSave) => {
  const { run } = resumeSave(save, content, ENGINE_MAJOR);
  return playtestReport({ save, run, slot: 0, build: 'web-playtest · test', content, scenes, t });
};

type Stamp = (c: CaseSpec, stamps: readonly Destination[]) => Destination;
const right: Stamp = (c) => c.expect.dest;
const wrong: Stamp = (c, stamps) => stamps.find((d) => d !== c.expect.dest) ?? c.expect.dest;

/** Plays the first choice on offer through a morning's scene, as a player would, and returns the action. */
function morningScene(run: RunState): RunAction | null {
  const id = content.days.find((d) => d.day === run.day)?.scenes?.morning;
  const json = id ? scenes[id] : undefined;
  if (!id || !json) return null;
  const env = sceneEnv(run, id);
  const picks: number[] = [];
  let frame = playScene(json, env, picks);
  while (!frame.done) {
    picks.push(
      Math.max(
        0,
        frame.choices.findIndex((c) => !c.locked),
      ),
    );
    frame = playScene(json, env, picks);
  }
  return { t: 'scene', id, choices: picks, effects: frame.effects };
}

/** A save of `days` whole days, each soul stamped by `stamp`, each morning's scene played when `story` is on. */
function played(seed: string, days: number, stamp: Stamp, story = false): RunSave {
  let save = startSave(content, seed, ENGINE_MAJOR);
  let run = save.mornings[0] as RunState;
  const apply = (action: RunAction) => {
    const env = { content, ctx: runContext(content, run), ...(save.queue ? { queue: save.queue } : {}) };
    const next = stepRun(run, action, env).state;
    save = recordAction(save, run, action, next);
    run = next;
  };
  while (run.day <= days && run.phase !== 'ending') {
    const scene = story ? morningScene(run) : null;
    if (scene) apply(scene);
    apply({ t: 'beginShift', at: 0 });
    const stamps = stampsFor(runContext(content, run));
    let at = 0;
    for (const c of run.shift?.cases ?? []) {
      at += 1000;
      apply({ t: 'shift', action: { t: 'stamp', dest: stamp(c, stamps), at } });
      apply({ t: 'shift', action: { t: 'send', at } });
    }
    apply({ t: 'endAudit' });
    apply({ t: 'endNight' });
  }
  return save;
}

describe('the playtest report', () => {
  it('gives each finished day a row: the souls, the pay, the bills and the rings after the night', () => {
    const save = played('playtest-right', 3, right);
    const text = report(save);
    const { run } = resumeSave(save, content, ENGINE_MAJOR);
    expect(text).toContain('## Playtest report');
    expect(text).toContain('- **Build:** web-playtest · test');
    expect(text).toContain('- **Now:** Day 4, morning');
    const rows = text.split('\n').filter((l) => /^\| \d+ \|/.test(l));
    expect(rows).toHaveLength(3);
    const first = run.ledger[0];
    expect(rows[0]?.startsWith(`| 1 | ${first?.correct} | 0 | 0 | +${first?.pay} |`)).toBe(true);
    expect(rows[2]).toContain(`| ${run.ledger[2]?.night?.rings} |`);
    expect(text).toContain('### Mistakes\n\nNone.');
  });

  it('names each soul sent wrong: the stamp, where it belonged, and the rule that said so', () => {
    const save = played('playtest-wrong', 1, wrong);
    const text = report(save);
    const { run } = resumeSave(save, content, ENGINE_MAJOR);
    const filed = run.ledger[0]?.mistakes ?? [];
    expect(filed.length).toBeGreaterThan(0);
    const lines = text.split('\n').filter((l) => l.startsWith('- Day 1: stamped'));
    expect(lines).toHaveLength(filed.length);
    const m = filed[0];
    expect(lines[0]).toContain(`stamped dest.${m?.stamped} for a soul that belonged in dest.${m?.expected}`);
    expect(lines[0]).toMatch(/The rule: “rule\./);
  });

  it('counts the mistakes of a day filed before they were itemised', () => {
    const save = played('playtest-old', 1, wrong);
    const old: RunSave = {
      ...save,
      mornings: save.mornings.map((m) => ({ ...m, ledger: m.ledger.map(({ mistakes: _, ...l }) => l) })),
    };
    expect(report(old)).toMatch(/- Day 1: \d+ sent wrong \(not itemised/);
  });

  it('reads back the options picked in each scene, as the journal does', () => {
    const save = played('playtest-story', 1, right, true);
    const entry = save.journal?.[0];
    expect(entry).toBeDefined();
    const text = report(save);
    const choice = text.split('\n').find((l) => l.startsWith('- Day 1, morning:'));
    expect(choice).toBeDefined();
    if (entry && entry.choices.length > 0) expect(choice).toMatch(/^- Day 1, morning: \S/);
  });
});
