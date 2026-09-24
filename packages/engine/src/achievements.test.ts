import { loadContent, loadDailyContent } from '@cots/testkit';
import { describe, expect, it } from 'vitest';
import {
  type AchievementMoment,
  earnedAt,
  type Facts,
  SHIFT_FACTS,
  SOUL_FACTS,
  shiftFacts,
  soulFacts,
} from './achievements';
import { dailySeed } from './calendar';
import { newRun } from './campaign/run';
import type { PlayMode } from './content/types';
import type { DayCtx } from './logic/context';
import { solve } from './logic/solver';
import type { Assists } from './shift/shift';
import { inspectable, type ShiftAction, type ShiftState, startShift, stepShift, type Verdict } from './shift/shift';

/*
 * Achievements (docs/tech-spec.md §34), checked against the real content the way the UI checks them: a
 * Daily played by a bot, soul by soul, then the shift as a whole.
 */

const full = loadContent('dev-full');
const defs = full.achievements ?? [];
const daily = loadDailyContent();
const spec = daily.daily;
if (!spec) throw new Error('No Daily in content');

const earned = (moment: AchievementMoment, have: readonly string[] = []) =>
  earnedAt(defs, moment, (id) => have.includes(id));

/** An action without its time: playDaily times them. */
type Untimed = ShiftAction extends infer A ? (A extends ShiftAction ? Omit<A, 'at'> : never) : never;

interface Played {
  initial: ShiftState;
  state: ShiftState;
  actions: ShiftAction[];
  ctx: DayCtx;
  /** Each judged soul's facts, as the soul was sent. */
  souls: Facts[];
}

/** Plays Daily #n: `play` gives each soul's actions (stamp and send are added), all a second apart. */
function playDaily(
  n: number,
  play: (s: ShiftState, ctx: DayCtx) => Untimed[] = () => [],
  opts: { assists?: Assists; sendAt?: (i: number) => number } = {},
): Played {
  const { state: initial, ctx } = startShift(daily, {
    mode: 'daily',
    seed: dailySeed(n),
    day: spec?.day ?? 5,
    dailyNumber: n,
  });
  const actions: ShiftAction[] = [];
  const souls: Facts[] = [];
  let state = initial;
  let at = 0;
  const step = (a: ShiftAction) => {
    const before = state;
    const r = stepShift(state, a, ctx);
    state = r.state;
    if (r.state !== before) actions.push(a);
    for (const e of r.events) if (e.e === 'judged') souls.push(soulFacts(before, e.verdict as Verdict));
  };
  step({ t: 'begin', at, ...(opts.assists ? { assists: opts.assists } : {}) });
  for (let i = 0; state.phase === 'shift'; i++) {
    const c = state.cases[state.cursor];
    if (!c) break;
    for (const a of play(state, ctx)) {
      at += 1000;
      step({ ...a, at } as ShiftAction);
    }
    at += 1000;
    step({ t: 'stamp', dest: c.expect.dest, at });
    at = Math.max(at + 1000, opts.sendAt?.(i) ?? 0);
    step({ t: 'send', at });
  }
  return { initial, state, actions, ctx, souls };
}

/** Everything a soul shows (flip, every tool, every field), then each of its lies called out. */
function callOutLies(s: ShiftState, ctx: DayCtx): Untimed[] {
  const c = s.cases[s.cursor];
  if (!c) return [];
  const out: Untimed[] = [];
  let soul = s;
  const look = (a: ShiftAction) => {
    soul = stepShift(soul, a, ctx).state;
    out.push(a);
  };
  if (ctx.tools.has('flip')) look({ t: 'flip', at: 0 });
  for (const tool of ctx.tools.keys()) if (tool !== 'flip') look({ t: 'tool', tool, at: 0 });
  look({ t: 'inspect', fields: inspectable(soul, ctx).map((f) => f.id), at: 0 });
  const seen = c.evidence.fields.filter((f) => soul.soul.seen.includes(f.id));
  for (const x of solve(seen, ctx).contradictions) {
    if (out.some((a) => a.t === 'compare' && (a.a === x.lie || a.b === x.lie))) continue;
    // Compared with something the soul has shown (not a question's answer or the way of the world).
    const other = x.against.find((id) => soul.soul.seen.includes(id));
    if (other) out.push({ t: 'compare', a: x.lie, b: other });
  }
  return out;
}

const shiftAt = (p: Played, mode: PlayMode = 'daily'): AchievementMoment => ({
  at: 'shift',
  mode,
  facts: shiftFacts(p.initial, p.actions, p.ctx),
});

describe('achievements', () => {
  it('count what their moment has, and nothing else', () => {
    const p = playDaily(41);
    expect(Object.keys(shiftFacts(p.initial, p.actions, p.ctx)).sort()).toEqual([...SHIFT_FACTS].sort());
    expect(Object.keys(p.souls[0] ?? {}).sort()).toEqual([...SOUL_FACTS].sort());
  });

  it('give a fast, unaided, perfect Daily all three of the Daily’s own, and only for the record', () => {
    const p = playDaily(41);
    const facts = shiftFacts(p.initial, p.actions, p.ctx);
    expect(facts).toMatchObject({ perfect: 1, hints: 0, assisted: 0, dusk: 0 });
    expect(facts.sunLeft).toBeGreaterThanOrEqual(90);
    expect(earned(shiftAt(p))).toEqual(['ach.cleanSlate', 'ach.nobodysHelp', 'ach.homeBeforeDark']);
    // The archive and practice don't count, and what's already earned isn't earned again.
    expect(earned(shiftAt(p, 'archive'))).toEqual([]);
    expect(earned(shiftAt(p, 'practice'))).toEqual([]);
    expect(earned(shiftAt(p), ['ach.cleanSlate', 'ach.homeBeforeDark'])).toEqual(['ach.nobodysHelp']);
  });

  it('keep the clean slate for a Daily played with help, and the rest for one played alone', () => {
    // A hint from Skögul: still quick, but not alone.
    const hinted = playDaily(41, (s) => (s.cursor === 0 ? [{ t: 'hint' }] : []));
    expect(shiftFacts(hinted.initial, hinted.actions, hinted.ctx).hints).toBe(1);
    expect(earned(shiftAt(hinted))).toEqual(['ach.cleanSlate', 'ach.homeBeforeDark']);
    // A slower sun is an assist.
    const slow = playDaily(41, () => [], { assists: { sunPct: 50 } });
    expect(earned(shiftAt(slow))).toEqual(['ach.cleanSlate']);
    // Perfect, but most of the sun gone: 4 minutes of 6.
    const late = playDaily(41, () => [], { sendAt: (i) => (i === 7 ? 240_000 : 0) });
    expect(shiftFacts(late.initial, late.actions, late.ctx).sunLeft).toBe(33);
    expect(earned(shiftAt(late))).toEqual(['ach.cleanSlate', 'ach.nobodysHelp']);
    // One wrong stamp and none of them.
    const { state: first, ctx } = startShift(daily, {
      mode: 'daily',
      seed: dailySeed(41),
      day: spec.day,
      dailyNumber: 41,
    });
    const wrong = first.cases[0]?.expect.dest === 'HEL' ? 'VALHALLA' : 'HEL';
    let s = stepShift(first, { t: 'begin', at: 0 }, ctx).state;
    const actions: ShiftAction[] = [{ t: 'begin', at: 0 }];
    for (const [i, c] of first.cases.entries()) {
      const stamp: ShiftAction = { t: 'stamp', dest: i === 0 ? wrong : c.expect.dest, at: 1000 * i + 500 };
      const send: ShiftAction = { t: 'send', at: 1000 * i + 900 };
      s = stepShift(stepShift(s, stamp, ctx).state, send, ctx).state;
      actions.push(stamp, send);
    }
    expect(earned({ at: 'shift', mode: 'daily', facts: shiftFacts(first, actions, ctx) })).toEqual([]);
  });

  it('see a confession when a lie that confesses is called out and questioned', () => {
    // The first Daily with a soul whose lie confesses.
    for (let n = 1; n < 40; n++) {
      const probe = startShift(daily, { mode: 'daily', seed: dailySeed(n), day: spec.day, dailyNumber: n });
      const at = probe.state.cases.findIndex((c) => c.lies.some((l) => l.onQuestion === 'confess'));
      if (at < 0) continue;
      const p = playDaily(n, (s, ctx) => {
        if (s.cursor !== at) return [];
        const lie = s.cases[at]?.lies.find((l) => l.onQuestion === 'confess');
        return lie ? [...callOutLies(s, ctx), { t: 'question', lie: lie.field }] : [];
      });
      const soul = p.souls[at];
      expect(soul).toMatchObject({ questioned: 1, confessed: 1, correct: 1 });
      expect(earned({ at: 'soul', mode: 'daily', facts: soul ?? {} })).toEqual(['ach.askedNicely']);
      // The primer walks the player through it, so it earns nothing there.
      expect(earned({ at: 'soul', mode: 'primer', facts: soul ?? {} })).toEqual([]);
      // Other souls confessed nothing.
      expect(p.souls.filter((f) => f.confessed === 1)).toHaveLength(1);
      expect(shiftFacts(p.initial, p.actions, p.ctx)).toMatchObject({ questions: 1, confessions: 1 });
      return;
    }
    throw new Error('no Daily with a lie that confesses');
  });

  it('see every lie called out in a shift, and a lie left uncalled', () => {
    const p = playDaily(41, callOutLies);
    const facts = shiftFacts(p.initial, p.actions, p.ctx);
    expect(facts.lies).toBeGreaterThanOrEqual(3);
    expect(facts).toMatchObject({ caught: facts.lies, missedLies: 0 });
    expect(earned(shiftAt(p, 'practice'))).toEqual(['ach.nothingGetsPast']);
    // Leave the last liar's lie uncalled.
    const last = p.initial.cases.map((c) => c.lies.length > 0).lastIndexOf(true);
    const q = playDaily(41, (s, ctx) => (s.cursor === last ? [] : callOutLies(s, ctx)));
    expect(shiftFacts(q.initial, q.actions, q.ctx).missedLies).toBeGreaterThan(0);
    expect(earned(shiftAt(q, 'practice'))).not.toContain('ach.nothingGetsPast');
  });

  it('see a soul judged rightly after the sun has set', () => {
    // Six souls in good time, the seventh sent in the grace after dusk: the gate shuts on the eighth.
    const p = playDaily(41, () => [], { sendAt: (i) => (i === 6 ? 360_000 + 30_000 : 0) });
    expect(p.state.endedBy).toBe('dusk');
    expect(p.souls.map((f) => f.afterDusk)).toEqual([0, 0, 0, 0, 0, 0, 1]);
    expect(earned({ at: 'soul', mode: 'daily', facts: p.souls[6] ?? {} })).toEqual(['ach.lastLight']);
    expect(earned({ at: 'soul', mode: 'daily', facts: p.souls[5] ?? {} })).toEqual([]);
    expect(shiftFacts(p.initial, p.actions, p.ctx)).toMatchObject({ judged: 7, perfect: 0, dusk: 1, sunLeft: 0 });
    // The last soul sent after dusk ends the queue instead, with no sun left over.
    const last = playDaily(41, () => [], { sendAt: (i) => (i === 7 ? 360_000 + 30_000 : 0) });
    expect(last.state.endedBy).toBe('queue');
    expect(last.souls[7]?.afterDusk).toBe(1);
    expect(shiftFacts(last.initial, last.actions, last.ctx)).toMatchObject({ perfect: 1, dusk: 0, sunLeft: 0 });
  });

  it('count an Endless run’s score, and decide nothing from numbers a record doesn’t keep', () => {
    expect(earned({ at: 'endless', facts: { score: 25, round: 6, strikes: 2 } })).toEqual(['ach.longWatch']);
    expect(earned({ at: 'endless', facts: { score: 15, round: 4, strikes: 0 } })).toEqual(['ach.notAScratch']);
    expect(earned({ at: 'endless', facts: { score: 14, round: 3, strikes: 0 } })).toEqual([]);
    // A best score kept from before achievements: the long watch, but not whether it was clean.
    expect(earned({ at: 'endless', facts: { score: 30 } })).toEqual(['ach.longWatch']);
  });

  it('read the campaign run the way endings do, and each story ending once', () => {
    const run = newRun(full, 'ach');
    expect(earned({ at: 'run', run })).toEqual([]);
    const flags = { ...run.flags, loki_detained: 1, thorvald_returned: 1 };
    expect(earned({ at: 'run', run: { ...run, flags } })).toEqual(['ach.stitched']);
    expect(earned({ at: 'run', run: { ...run, flags: { ...flags, thorvald16_returned: 1 } } })).toEqual([
      'ach.stitched',
      'ach.unlucky',
    ]);
    // Ragnarök with everyone home; then with someone gone.
    const day20 = { ...run, day: 20 };
    expect(earned({ at: 'run', run: day20 })).toEqual(['ach.nobodyLeft']);
    const [first, ...rest] = run.family;
    if (!first) throw new Error('no family');
    const lost = { ...day20, family: [{ ...first, status: 'gone' as const, gone: 'left' as const }, ...rest] };
    expect(earned({ at: 'run', run: lost })).toEqual([]);
    expect(earned({ at: 'ending', ending: 'ending.odin' })).toEqual(['ach.odin']);
    expect(earned({ at: 'ending', ending: 'ending.odin' }, ['ach.odin'])).toEqual([]);
    // The failure endings earn nothing.
    expect(earned({ at: 'ending', ending: 'ending.demoted' })).toEqual([]);
  });

  it('give a spotless campaign day from Day 10 on', () => {
    const p = playDaily(41);
    const facts = shiftFacts(p.initial, p.actions, p.ctx);
    expect(earned({ at: 'shift', mode: 'campaign', facts: { ...facts, day: 10 } })).toEqual(['ach.spotless']);
    expect(earned({ at: 'shift', mode: 'campaign', facts: { ...facts, day: 9 } })).toEqual([]);
    expect(earned({ at: 'shift', mode: 'practice', facts: { ...facts, day: 10 } })).toEqual([]);
  });

  it('are each on the gallery once, with a title and a text', () => {
    const ids = defs.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(20);
    // The demo builds carry only the core, Daily and demo packs' achievements.
    const demo = (loadContent('web-demo').achievements ?? []).map((a) => a.id);
    expect(demo).toEqual([
      'ach.askedNicely',
      'ach.lastLight',
      'ach.nothingGetsPast',
      'ach.cleanSlate',
      'ach.nobodysHelp',
      'ach.homeBeforeDark',
      'ach.longWatch',
      'ach.notAScratch',
    ]);
  });
});
