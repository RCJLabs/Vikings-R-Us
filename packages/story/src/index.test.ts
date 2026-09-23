import { FACTIONS } from '@cots/engine';
import { Compiler } from 'inkjs/full';
import { describe, expect, it } from 'vitest';
import { parseFx, playScene, type SceneEnv, walkScene } from './index';

const compile = (src: string) => {
  const story = new Compiler(src).Compile();
  return story.ToJson() as string;
};

const env = (over: Partial<SceneEnv> = {}): SceneEnv => ({
  seed: 7,
  day: 3,
  rings: 12,
  flags: {},
  standing: Object.fromEntries(FACTIONS.map((f) => [f, 0])) as SceneEnv['standing'],
  family: { mother: 'well', sister: 'sick', brother: 'gone' },
  ...over,
});

const SCENE = `
EXTERNAL flag(name)
EXTERNAL rings()
EXTERNAL sick(id)
Skögul waits by the gate. # speaker: skogul
{ flag("met_loki"): She has heard about Loki. }
{ sick("sister"): A letter: your sister is worse. }
* [Pay the healer]
  You send what you can. # fx: rings -5
  # fx: family sister well
* [Keep the rings]
  You keep them. # fx: flag kept_rings
- The day begins. # fx: standing odin +1
`;

describe('playScene', () => {
  it('stops at the first choice with the lines so far', () => {
    const f = playScene(compile(SCENE), env(), []);
    expect(f.done).toBe(false);
    expect(f.choices).toEqual(['Pay the healer', 'Keep the rings']);
    expect(f.lines.map((l) => l.text)).toEqual(['Skögul waits by the gate.', 'A letter: your sister is worse.']);
    expect(f.lines[0]?.speaker).toBe('skogul');
    expect(f.effects).toEqual([]);
  });

  it('reads the run through externals', () => {
    const f = playScene(compile(SCENE), env({ flags: { met_loki: 1 }, family: { sister: 'well' } }), []);
    expect(f.lines.map((l) => l.text)).toEqual(['Skögul waits by the gate.', 'She has heard about Loki.']);
  });

  it('collects effects in order along the chosen path', () => {
    const json = compile(SCENE);
    const pay = playScene(json, env(), [0]);
    expect(pay.done).toBe(true);
    expect(pay.effects).toEqual([{ rings: -5 }, { family: 'sister', becomes: 'well' }, { standing: 'odin', by: 1 }]);
    const keep = playScene(json, env(), [1]);
    expect(keep.effects).toEqual([
      { flag: 'kept_rings', set: 1 },
      { standing: 'odin', by: 1 },
    ]);
    expect(keep.lines.at(-1)?.text).toBe('The day begins.');
  });

  it('is the same every time for the same seed and choices', () => {
    const json = compile('~ temp r = RANDOM(1, 1000)\nRolled {r}.\n* [a] A.\n* [b] B.\n- {shuffle: x|y|z}');
    const a = playScene(json, env({ seed: 99 }), [1]);
    const b = playScene(json, env({ seed: 99 }), [1]);
    expect(b).toEqual(a);
  });

  it('rejects a choice that is not offered', () => {
    expect(() => playScene(compile(SCENE), env(), [2])).toThrow(RangeError);
  });
});

describe('parseFx', () => {
  it('parses every effect form', () => {
    expect(parseFx('fx: rings -5')).toEqual({ rings: -5 });
    expect(parseFx('fx: rings +3')).toEqual({ rings: 3 });
    expect(parseFx(' fx: standing freyja +1')).toEqual({ standing: 'freyja', by: 1 });
    expect(parseFx('fx: flag owes_loki')).toEqual({ flag: 'owes_loki', set: 1 });
    expect(parseFx('fx: flag thorvald +1')).toEqual({ flag: 'thorvald', inc: 1 });
    expect(parseFx('fx: flag deals = 2')).toEqual({ flag: 'deals', set: 2 });
    expect(parseFx('fx: family sister sick')).toEqual({ family: 'sister', becomes: 'sick' });
  });

  it('ignores other tags and throws on malformed effects', () => {
    expect(parseFx('speaker: skogul')).toBeNull();
    for (const bad of [
      'fx: rings',
      'fx: rings five',
      'fx: standing thor +1',
      'fx: flag a-b',
      'fx: family x dead',
      'fx: gold 5',
    ]) {
      expect(() => parseFx(bad), bad).toThrow();
    }
  });
});

describe('walkScene', () => {
  it('visits every path to its end', () => {
    const w = walkScene(compile(SCENE), env());
    expect(w.paths).toBe(2);
    expect(w.effects.map((e) => e.length)).toEqual([3, 2]);
  });

  it('finds a malformed effect on a path that is rarely taken', () => {
    const json = compile('* [a] Fine.\n* [b] Broken. # fx: rings lots\n- End.');
    expect(() => playScene(json, env(), [0])).not.toThrow();
    expect(() => walkScene(json, env())).toThrow(/bad number/);
  });

  it('gives up on scenes with too many paths', () => {
    const src = Array.from({ length: 10 }, (_, i) => `* [a${i}] A.\n* [b${i}] B.\n-`).join('\n');
    expect(() => walkScene(compile(src), env(), 100)).toThrow(/more than 100 paths/);
  });
});
