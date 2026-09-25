import {
  type CaseSpec,
  type DayLedger,
  type Destination,
  ENGINE_MAJOR,
  type Faction,
  type JournalEntry,
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
import { loadContent, loadScenes, scenarioSave } from '@cots/testkit';
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

  it('says when a soul sent wrong came after a noon decree', () => {
    const save = played('playtest-wrong', 1, wrong);
    const first = (l: DayLedger): DayLedger => ({
      ...l,
      mistakes: (l.mistakes ?? []).map((x, i) => (i === 0 ? { ...x, noon: true as const } : x)),
    });
    const noon: RunSave = { ...save, mornings: save.mornings.map((m) => ({ ...m, ledger: m.ledger.map(first) })) };
    const lines = report(noon)
      .split('\n')
      .filter((l) => l.startsWith('- Day 1: stamped'));
    expect(lines[0]).toMatch(/ After the noon decree\.$/);
    expect(lines.slice(1).filter((l) => l.includes('noon'))).toEqual([]);
  });

  it('counts the mistakes of a day filed before they were itemised', () => {
    const save = played('playtest-old', 1, wrong);
    const old: RunSave = {
      ...save,
      mornings: save.mornings.map((m) => ({ ...m, ledger: m.ledger.map(({ mistakes: _, ...l }) => l) })),
    };
    expect(report(old)).toMatch(/- Day 1: \d+ sent wrong \(not itemised/);
  });

  it('lists each appeal heard: whose, what was decided, and the rings', () => {
    // A day of mistakes, and a seed whose next morning brings an appeal.
    const found = ['a1', 'a2', 'a3', 'a4', 'a5']
      .map((seed) => played(`playtest-appeal-${seed}`, 1, wrong))
      .find((save) => resumeSave(save, content, ENGINE_MAJOR).run.appeal !== undefined);
    expect(found).toBeDefined();
    if (!found) return;
    let save = found;
    let run = resumeSave(save, content, ENGINE_MAJOR).run;
    const expected = run.appeal?.case.expect.dest ?? 'HEL';
    const action: RunAction = { t: 'appeal', stamped: expected };
    const next = stepRun(run, action, { content, ctx: runContext(content, run) }).state;
    save = recordAction(save, run, action, next);
    run = next;
    const text = report(save);
    expect(text).toContain('### Appeals');
    expect(text).toMatch(
      /^- Day 2, this morning: \S+, judged on Day 1 and sent to dest\.\w+: righted, to dest\.\w+, [+-]?\d+ rings\.$/m,
    );
    expect(report(played('playtest-appeal-none', 1, right))).toContain('### Appeals\n\nNone.');
  });

  it('tells of each night the sun set on the line: who waited for the next day, and what it cost', () => {
    let save = startSave(content, 'playtest-line', ENGINE_MAJOR);
    let run = save.mornings[0] as RunState;
    const apply = (action: RunAction) => {
      const env = { content, ctx: runContext(content, run), ...(save.queue ? { queue: save.queue } : {}) };
      const next = stepRun(run, action, env).state;
      save = recordAction(save, run, action, next);
      run = next;
    };
    apply({ t: 'beginShift', at: 0 });
    const cases = run.shift?.cases ?? [];
    const sunMs = run.shift?.sunMs ?? 0;
    for (const [i, c] of cases.slice(0, 2).entries()) {
      apply({ t: 'shift', action: { t: 'stamp', dest: c.expect.dest, at: (i + 1) * 1000 } });
      apply({ t: 'shift', action: { t: 'send', at: (i + 1) * 1000 } });
    }
    // Dusk, and its grace, with the rest still in line: a crowded gate.
    apply({ t: 'shift', action: { t: 'tick', at: sunMs + 61_000 } });
    const left = cases.slice(2).map((c) => `${c.evidence.look.name} ${c.evidence.look.patronym}`);
    expect(left.length).toBeGreaterThanOrEqual(3);
    expect(report(save)).toContain(
      `### The line at dusk\n\n- Day 1: ${left.join(', ')} waited for Day 2. Standing: faction.hel -1.`,
    );
    expect(report(played('playtest-line-none', 1, right))).toContain(
      '### The line at dusk\n\nNobody was left in line.',
    );
  });

  it('tells of each god’s request: what was asked, how many were sent as asked, and the reward', () => {
    // A morning with a request, and a day that does as it asks (every other soul sent where it belongs).
    const found = Array.from({ length: 12 }, (_, i) =>
      scenarioSave(content, `playtest-ask-${i}`, 5, ENGINE_MAJOR),
    ).find((s) => (resumeSave(s, content, ENGINE_MAJOR).run.requests?.length ?? 0) > 0);
    expect(found).toBeDefined();
    if (!found) return;
    let save = found;
    let run = resumeSave(save, content, ENGINE_MAJOR).run;
    const [asked, rival] = run.requests ?? [];
    if (!asked) return;
    const apply = (action: RunAction) => {
      const env = { content, ctx: runContext(content, run), ...(save.queue ? { queue: save.queue } : {}) };
      const next = stepRun(run, action, env).state;
      save = recordAction(save, run, action, next);
      run = next;
    };
    apply({ t: 'beginShift', at: 0 });
    let favours = 0;
    let at = 0;
    for (const c of run.shift?.cases ?? []) {
      const favour = c.expect.dest === asked.from && favours < asked.n;
      if (favour) favours++;
      at += 1000;
      apply({ t: 'shift', action: { t: 'stamp', dest: favour ? asked.to : c.expect.dest, at } });
      apply({ t: 'shift', action: { t: 'send', at } });
    }
    expect(favours).toBe(asked.n);
    const god = (f: string) => `faction.${f}`;
    const text = report(save);
    expect(text).toContain(
      `- Day 5: ${god(asked.god)} asked for ${asked.n} from dest.${asked.from} sent to dest.${asked.to}; ${asked.n} sent as asked: done (${god(asked.god)} +1).`,
    );
    // A rival asks for the same souls sent elsewhere: doing one god's favour leaves the other's undone.
    if (rival)
      expect(text).toContain(
        `- Day 5: ${god(rival.god)} asked for ${rival.n} from dest.${rival.from} sent to dest.${rival.to}; 0 sent as asked: not done.`,
      );
    expect(report(played('playtest-ask-none', 1, right))).toContain('### Requests\n\nNone yet.');
  });

  it('lists the gods’ favours each day held, as the gate granted them, and the fines they spared', () => {
    const mark = (id: string) => content.campaign?.favours?.find((f) => f.id === id)?.at ?? 4;
    /** Day 5 played from a morning with `god`'s standing at `at`, every soul stamped by `stamp`. */
    const favoured = (god: Faction, at: number, stamp: Stamp) => {
      const base = scenarioSave(content, 'playtest-favour', 5, ENGINE_MAJOR);
      const morning = base.mornings[base.mornings.length - 1] as RunState;
      let run: RunState = { ...morning, standing: { ...morning.standing, [god]: at } };
      let save: RunSave = { ...base, mornings: [...base.mornings.slice(0, -1), run] };
      const apply = (action: RunAction) => {
        const env = { content, ctx: runContext(content, run), ...(save.queue ? { queue: save.queue } : {}) };
        const next = stepRun(run, action, env).state;
        save = recordAction(save, run, action, next);
        run = next;
      };
      apply({ t: 'beginShift', at: 0 });
      const stamps = stampsFor(runContext(content, run));
      let t = 0;
      for (const c of run.shift?.cases ?? []) {
        t += 1000;
        apply({ t: 'shift', action: { t: 'stamp', dest: stamp(c, stamps), at: t } });
        apply({ t: 'shift', action: { t: 'send', at: t } });
      }
      return { save, eased: run.ledger.at(-1)?.eased };
    };
    const freyja = favoured('freyja', mark('fav.freyja'), right);
    expect(report(freyja.save)).toContain("### Favours\n\n- Day 5: faction.freyja's favour (favour.freyja).");
    const clerk = favoured('clerk', mark('fav.clerk'), wrong);
    expect(clerk.eased).toBeGreaterThan(0);
    expect(report(clerk.save)).toContain(
      `### Favours\n\n- Day 5: faction.clerk's favour (favour.clerk); ${clerk.eased} rings of fines spared.`,
    );
    expect(report(played('playtest-favour-none', 1, right))).toContain('### Favours\n\nNone yet.');
  });

  it('tells of each promotion offered and what was made of it, and the days worked at each rank', () => {
    // Days 1-3 judged rightly: Day 4 brings the first offer.
    let save = scenarioSave(content, 'playtest-rank', 4, ENGINE_MAJOR);
    let run = resumeSave(save, content, ENGINE_MAJOR).run;
    expect(run.offer).toBe(1);
    const apply = (action: RunAction) => {
      const env = { content, ctx: runContext(content, run), ...(save.queue ? { queue: save.queue } : {}) };
      const next = stepRun(run, action, env).state;
      save = recordAction(save, run, action, next);
      run = next;
    };
    apply({ t: 'promotion', accept: true });
    for (let day = 4; day <= 5; day++) {
      apply({ t: 'beginShift', at: 0 });
      let at = 0;
      for (const c of run.shift?.cases ?? []) {
        at += 1000;
        apply({ t: 'shift', action: { t: 'stamp', dest: c.expect.dest, at } });
        apply({ t: 'shift', action: { t: 'send', at } });
      }
      apply({ t: 'endAudit' });
      if (day === 5) apply({ t: 'stepDown' });
      apply({ t: 'endNight' });
    }
    expect(report(save)).toContain(
      '### Rank\n\n- Day 4: offered rank.second; taken.\n- Days 4–5: worked as rank.second.\n- Day 5: stepped down from rank.second.',
    );
    expect(report(played('playtest-rank-none', 1, right))).toContain('### Rank\n\nNo promotion yet.');
  });

  it('names a scene played at the desk as such (docs/tech-spec.md §46)', () => {
    const save = played('playtest-desk', 1, right);
    const morning = save.mornings[0] as RunState;
    const visit = content.days.flatMap((d) => (d.queue.visits ?? []).map((v) => ({ day: d.day, scene: v.scene })))[0];
    if (!visit) throw new Error('no one comes to the desk in this build');
    const entry: JournalEntry = {
      ...visit,
      choices: [0],
      rings: morning.rings,
      flags: {},
      standing: morning.standing,
      family: Object.fromEntries(morning.family.map((m) => [m.id, m.status])),
    };
    const text = report({ ...save, journal: [...(save.journal ?? []), entry] });
    expect(text).toMatch(new RegExp(`- Day ${visit.day}, at the desk: \\S`));
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
