import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TARGETS, type TargetId } from '@cots/content-schema';
import type { DaySpec, ScriptedCaseDef } from '@cots/engine';
import { playScene, type SceneEnv } from '@cots/story';
import { afterEach, describe, expect, it } from 'vitest';
import { compileTarget, loadPacks, type Packs, writeLeakTokens } from './compile';
import { compileScene } from './scenes';

const packsDir = resolve(import.meta.dirname, '../../../content/packs');

let out = '';
afterEach(() => {
  if (out) rmSync(out, { recursive: true, force: true });
  out = '';
});

const build = (packs: Packs, target: TargetId = 'dev-full') => {
  out = mkdtempSync(join(tmpdir(), 'cots-story-'));
  return compileTarget(target, TARGETS[target], packs, out);
};

/** The real packs, with one pack's content or scenes changed for a test. */
function packsWith(change: (packs: Packs) => void): Packs {
  const packs = loadPacks(packsDir);
  change(packs);
  return packs;
}

const demoPack = (packs: Packs) => {
  const p = packs.get('demo');
  if (!p) throw new Error('no demo pack');
  return p;
};

const withDay = (packs: Packs, day: number, change: (d: DaySpec) => DaySpec) => {
  const pack = demoPack(packs);
  pack.content.days = pack.content.days.map((d) => (d.day === day ? change(d) : d));
};

const env: SceneEnv = {
  seed: 1,
  day: 1,
  rings: 10,
  flags: {},
  standing: { odin: 0, freyja: 0, hel: 0, loki: 0, clerk: 0 },
  family: { mother: 'well', brother: 'well', sister: 'well' },
};

describe('compiling a scene', () => {
  it('names it after its file and reads its draft mark, words and speakers', () => {
    const s = compileScene('x/d9.test.ink', '# draft\nHello. # speaker: skogul\n* [Go]\n  Gone.\n-> END\n');
    expect(s).toMatchObject({ id: 'scene.d9.test', draft: true, speakers: ['skogul'] });
    expect(s.words).toBeGreaterThan(0);
    expect(playScene(s.json, env, [0]).lines.map((l) => l.text)).toEqual(['Hello.', 'Go', 'Gone.']);
  });

  it.each([
    ['an Ink error', 'Hello.\n-> nowhere\n', /Divert target not found/],
    ['an unknown external', 'EXTERNAL gold()\nHello.\n', /EXTERNAL gold isn't one the game provides/],
    ['a malformed effect', 'Hello. # fx: rings lots\n', /bad number/],
    ['an effect on a choice line', '* [Pay] # fx: rings -5\n  Paid.\n', /line 1: put effect tags on the line after/],
    ['a computed effect', 'Hello. # fx: rings {x}\n', /must be plain text/],
    ['an INCLUDE', 'INCLUDE other.ink\nHello.\n', /INCLUDE isn’t supported/],
    [
      'a choice with text outside its brackets',
      '* Pay [up] now\n  Paid.\n',
      /line 1: write a choice as \[its whole text\]/,
    ],
    ['a cost outside an option', 'Hello. #needs: rings 5\n', /line 1: put a needs tag inside the option's brackets/],
    ['a malformed cost', '* [Pay. #needs: 5 rings]\n  Paid.\n', /line 1: malformed needs tag/],
  ])('rejects %s', (_, source, error) => {
    expect(() => compileScene('x/d9.test.ink', source)).toThrow(error);
  });

  it('rejects file names that make awkward ids', () => {
    expect(() => compileScene('x/Day 9.ink', 'Hello.\n')).toThrow(/named like/);
  });
});

// These build whole targets (content, scenes, story souls, the Daily check table): seconds on a busy CI runner.
describe('scenes in a target', { timeout: 30_000 }, () => {
  it('ships only the target’s packs’ scenes, and they play', () => {
    const packs = loadPacks(packsDir);
    const result = build(packs, 'web-demo');
    const scenes = JSON.parse(readFileSync(join(out, 'web-demo', 'scenes.json'), 'utf8')) as Record<string, object>;
    expect(Object.keys(scenes).sort()).toEqual(
      ['d1', 'd2', 'd3'].flatMap((d) => [`scene.${d}.morning`, `scene.${d}.night`]).sort(),
    );
    expect(result).toMatchObject({ scenes: 6 });
    const d1 = scenes['scene.d1.morning'] as object;
    const frame = playScene(d1, env, [0]);
    expect(frame.done).toBe(true);
    expect(frame.effects).toEqual([{ flag: 'asked_about_lies', set: 1 }]);
    expect(readFileSync(join(out, 'web-demo', 'index.ts'), 'utf8')).toContain("import('./scenes.json')");
  });

  it('rejects a day that plays a missing scene', () => {
    const packs = packsWith((p) => withDay(p, 1, (d) => ({ ...d, scenes: { morning: 'scene.nope' } })));
    expect(() => build(packs)).toThrow(/day 1 plays missing scene "scene.nope"/);
  });

  it('rejects a scene no day plays', () => {
    const packs = packsWith((p) => demoPack(p).scenes.push(compileScene('x/d9.extra.ink', 'Hello.\n')));
    expect(() => build(packs)).toThrow(/no day plays scene.d9.extra/);
  });

  it('rejects effects on family the campaign doesn’t have, and speakers without names', () => {
    const odd = compileScene(
      'x/d1.night.ink',
      'A letter. # speaker: cousin\n* [Read it]\n  Bad news.\n  # fx: family cousin sick\n- End.\n',
    );
    const packs = packsWith((p) => {
      const pack = demoPack(p);
      pack.scenes = pack.scenes.map((s) => (s.id === 'scene.d1.night' ? odd : s));
    });
    expect(() => build(packs)).toThrow(/changes unknown family member "cousin"/);
    expect(() => build(packs)).toThrow(/missing string "speaker.cousin"/);
  });

  it('puts scene and story soul ids in the leak tokens', () => {
    out = mkdtempSync(join(tmpdir(), 'cots-story-'));
    writeLeakTokens(loadPacks(packsDir), out);
    const tokens = (pack: string) =>
      (JSON.parse(readFileSync(join(out, 'leak', `${pack}.tokens.json`), 'utf8')) as { tokens: string[] }).tokens;
    expect(tokens('demo')).toEqual(expect.arrayContaining(['scene.d1.morning', 'case.thorvald1']));
    expect(tokens('campaign')).toEqual(expect.arrayContaining(['scene.d4.morning', 'scene.d5.night']));
  });
});

describe('story souls in a target', { timeout: 30_000 }, () => {
  const thorvald = (packs: Packs) => {
    const def = demoPack(packs).content.scripted.find((d) => d.id === 'case.thorvald1');
    if (!def) throw new Error('no Thorvald');
    return def;
  };
  const replace = (packs: Packs, def: ScriptedCaseDef) => {
    const pack = demoPack(packs);
    pack.content.scripted = pack.content.scripted.map((d) => (d.id === def.id ? def : d));
  };

  it('proves each placed soul can be made and goes where it says', () => {
    const packs = packsWith((p) => replace(p, { ...thorvald(p), expect: 'HEL' }));
    expect(() => build(packs)).toThrow(
      /day 3: story soul case.thorvald1 can't be made on day 3 \(last try: it would go to RETURN\)/,
    );
  });

  it('rejects unknown facts, missing lines and unplaced or unknown souls', () => {
    const packs = packsWith((p) => {
      const t = thorvald(p);
      replace(p, { ...t, truth: { ...t.truth, luck: { is: 0 } }, lines: ['case.thorvald1.missing'] });
      demoPack(p).content.scripted.push({ ...t, id: 'case.nobody' });
      withDay(p, 2, (d) => ({ ...d, queue: { ...d.queue, scripted: [{ case: 'case.ghost', at: 0 }] } }));
    });
    const error = (() => {
      try {
        build(packs);
      } catch (e) {
        return (e as Error).message;
      }
      return '';
    })();
    expect(error).toMatch(/story soul case.thorvald1 refers to unknown fact "luck"/);
    expect(error).toMatch(/story soul case.thorvald1 uses missing string "case.thorvald1.missing"/);
    expect(error).toMatch(/No day places story soul "case.nobody"/);
    expect(error).toMatch(/day 2 places unknown story soul "case.ghost"/);
  });
});
