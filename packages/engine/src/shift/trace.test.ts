import { loadDailyContent } from '@cots/testkit';
import { describe, expect, it } from 'vitest';
import { dailySeed } from '../calendar';
import type { DayCtx } from '../logic/context';
import { inspectable, type ShiftAction, type ShiftState, startShift, stepShift } from './shift';
import { traceShift } from './trace';

const content = loadDailyContent();

/** A scripted player: looks at everything, turns over, uses the feather, stamps right or wrong. */
function play(state0: ShiftState, ctx: DayCtx, wrongAt = -1) {
  const actions: ShiftAction[] = [];
  let s = state0;
  let at = 0;
  const push = (a: ShiftAction) => {
    actions.push(a);
    s = stepShift(s, a, ctx).state;
  };
  push({ t: 'begin', at });
  while (s.phase === 'shift') {
    at += 3_000;
    push({ t: 'inspect', fields: inspectable(s, ctx).map((f) => f.id), at });
    push({ t: 'flip', at });
    push({ t: 'inspect', fields: inspectable(s, ctx).map((f) => f.id), at });
    push({ t: 'tool', tool: 'feather', at });
    const c = s.cases[s.cursor];
    if (!c) break;
    const dest = s.cursor === wrongAt ? (c.expect.dest === 'HEL' ? 'VALHALLA' : 'HEL') : c.expect.dest;
    push({ t: 'stamp', dest, at });
    push({ t: 'send', at: at + 500 });
  }
  return { actions, end: s };
}

describe('shift traces', () => {
  const { state, ctx } = startShift(content, { mode: 'daily', seed: dailySeed(9), day: 5, dailyNumber: 9 });

  it('splits a finished Daily by soul and matches the live state', () => {
    const { actions, end } = play(state, ctx, 2);
    const t = traceShift(state, actions, ctx);
    expect(t.state).toEqual(end);
    expect(t.souls).toHaveLength(8);
    for (const soul of t.souls) {
      expect(soul.actions.at(-1)?.t).toBe('send');
      expect(soul.flipped).toBe(true);
      expect(soul.tools).toEqual(['feather']);
      expect(soul.penaltyMs).toBe(12_000);
      expect(soul.verdict?.correct).toBe(soul.index !== 2);
    }
    // Sun per soul adds up to the time of the last judgment.
    const total = t.souls.reduce((n, s) => n + s.sunMs, 0);
    expect(total).toBe(end.verdicts.at(-1)?.atMs);
    expect(t.souls[0]?.seen).toContain('body.front.grip');
  });

  it('shows the soul at the gate mid-shift, and leaves the rest empty', () => {
    const { actions } = play(state, ctx);
    const feathers = actions.flatMap((a, i) => (a.t === 'tool' ? [i] : []));
    const cut = feathers[1] ?? 0; // the second soul's feather
    const t = traceShift(state, actions.slice(0, cut + 1), ctx);
    expect(t.state.cursor).toBe(1);
    expect(t.souls[1]?.verdict).toBeNull();
    expect(t.souls[1]?.tools).toEqual(['feather']);
    expect(t.souls[2]?.actions).toEqual([]);
  });

  it('ignores actions the shift rejected', () => {
    const t = traceShift(
      state,
      [
        { t: 'begin', at: 0 },
        { t: 'send', at: 1 },
        { t: 'compare', a: 'x', b: 'y', at: 2 },
      ],
      ctx,
    );
    expect(t.souls[0]?.actions).toEqual([]);
  });
});
