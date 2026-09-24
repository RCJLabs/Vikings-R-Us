import { loadContent } from '@cots/testkit';
import { describe, expect, it } from 'vitest';
import { generateDay } from '../gen/generate';
import { createDayContext } from '../logic/context';
import { ENDLESS_SOULS, endlessDay, endlessRound } from './endless';
import { startShift } from './shift';

const full = loadContent('dev-full');
const demo = loadContent('web-demo');

describe('Endless', () => {
  it('walks the days in order, then stays on the last', () => {
    const days = full.days.map((d) => d.day);
    const last = Math.max(...days);
    expect(Array.from({ length: days.length }, (_, r) => endlessDay(full, r))).toEqual(days);
    expect(endlessDay(full, days.length + 5)).toBe(last);
    // The demo walks only the demo's days.
    expect([0, 1, 2, 3, 9].map((r) => endlessDay(demo, r))).toEqual([1, 2, 3, 3, 3]);
  });

  it('plays the start of each day’s own queue, so the new rule comes first', () => {
    for (const round of [0, 7, 11, 19, 25]) {
      const r = endlessRound(full, 'e', round);
      expect(r.cases).toHaveLength(ENDLESS_SOULS);
      const ctx = createDayContext(full, r.day, r.seed);
      expect(r.cases).toEqual(generateDay(r.seed, ctx).cases.slice(0, ENDLESS_SOULS));
      const teach = ctx.spec.queue.teachFirst;
      if (teach) expect(r.cases[0]?.archetype).toBe(teach);
    }
  });

  it('is the same every time for a seed, and different rounds differ', () => {
    expect(endlessRound(full, 'e', 3)).toEqual(endlessRound(full, 'e', 3));
    expect(endlessRound(full, 'e', 3).seed).not.toBe(endlessRound(full, 'e', 4).seed);
  });

  it('starts a shift whose day context is the round’s', () => {
    const r = endlessRound(full, 'e', 12);
    const { state, ctx } = startShift(full, { mode: 'practice', seed: r.seed, day: r.day, untimed: true }, r.cases);
    expect(ctx.day).toBe(r.day);
    expect(ctx.params).toEqual(createDayContext(full, r.day, r.seed).params);
    expect(state.cases).toEqual(r.cases);
  });
});
