import { loadContent, oracleSolve } from '@cots/testkit';
import { describe, expect, it } from 'vitest';
import { createDayContext, type DayCtx } from '../logic/context';
import { judge } from '../logic/judge';
import { isPerceivable, solve } from '../logic/solver';
import { questionResponse } from '../narrative/questions';
import { startShift, stepShift } from '../shift/shift';
import { generateDay } from './generate';
import type { CaseSpec, Field } from './types';
import { decisiveFacts, revealsOf, validateCase } from './validate';

/*
 * The later decrees (docs/build-plan.md §2): the registry (Day 6), the
 * rune-lens and borrowed weapons (Day 7), clipping nails (Day 8) and forged
 * saga tallies (Day 11). Each mechanic, and a broken case the validator must
 * reject.
 */

const full = loadContent('dev-full');

/** The first generated soul on `day` that `pick` accepts, searching a few seeds. */
function findCase(
  day: number,
  pick: (c: CaseSpec, ctx: DayCtx) => boolean,
): { c: CaseSpec; ctx: DayCtx; seed: string } {
  for (let s = 0; s < 60; s++) {
    const seed = `decrees-${day}-${s}`;
    const ctx = createDayContext(full, day, seed);
    const c = generateDay(seed, ctx).cases.find((x) => pick(x, ctx));
    if (c) return { c, ctx, seed };
  }
  throw new Error(`no such soul on day ${day}`);
}

const revalidate = (c: CaseSpec, ctx: DayCtx, fields: readonly Field[]) =>
  validateCase(
    { ...c.evidence, fields },
    c.truth,
    c.lies,
    c.expect,
    decisiveFacts(c.truth, c.expect, ctx),
    ctx,
    ctx.spec.queue.knobs,
  );

describe('Day 7: the rune-lens reads whose weapon it is', () => {
  it('sends a soul holding someone else’s weapon to Hel, and only the lens shows it', () => {
    const { c, ctx } = findCase(7, (x) => x.truth.weaponOwner === 'other');
    expect(c.expect).toMatchObject({ dest: 'HEL', rule: 'rule.borrowed' });
    const inscription = c.evidence.fields.find((f) => f.obs?.key === 'inscription');
    expect(inscription).toMatchObject({ tool: 'runeLens', obs: { value: 'other' } });
    // Without the lens's reading the presumption (their own weapon) would stand.
    const blind = solve(
      c.evidence.fields.filter((f) => f !== inscription),
      ctx,
      { reveals: revealsOf(c.lies) },
    );
    expect(blind.judgment).not.toMatchObject({ kind: 'determined', dest: 'HEL', rule: 'rule.borrowed' });
    expect(c.evidence.fields.some((f) => f.cue?.key === 'wrongGrip')).toBe(true);
  });

  it('rejects a borrowed weapon with no cue to reach for the lens', () => {
    const { c, ctx } = findCase(7, (x) => x.truth.weaponOwner === 'other');
    const v = revalidate(
      c,
      ctx,
      c.evidence.fields.filter((f) => f.cue?.key !== 'wrongGrip'),
    );
    expect(v).toMatchObject({ ok: false, code: 'CUE_MISSING' });
  });
});

describe('Day 8: the Naglfar decree adds a procedure to the judgment', () => {
  it('requires clipping for long nails, and only from Day 8', () => {
    const { c } = findCase(8, (x) => x.truth.nailsGrown === true);
    expect(c.expect.procedures).toEqual(['proc.clip']);
    const day7 = createDayContext(full, 7, 'decrees');
    expect(judge({ ...c.truth }, day7).procedures).toBeUndefined();
  });

  it('can’t settle the procedure without looking at the hands', () => {
    const { c, ctx } = findCase(8, (x) => x.truth.nailsGrown === true);
    const handsUnseen = c.evidence.fields.filter((f) => f.obs?.key !== 'nails');
    expect(solve(handsUnseen, ctx, { reveals: revealsOf(c.lies) }).judgment).toMatchObject({
      kind: 'undetermined',
      rule: 'proc.clip',
    });
    expect(c.meta.proof).toContain('body.front.nails');
  });

  it('counts a right stamp as wrong until the nails are clipped', () => {
    const { c, ctx, seed } = findCase(8, (x) => x.truth.nailsGrown === true);
    const { state } = startShift(full, { mode: 'practice', seed, day: 8 }, [c]);
    const begun = stepShift(state, { t: 'begin', at: 0 }, ctx).state;
    const send = (s: typeof begun, at: number) =>
      stepShift(stepShift(s, { t: 'stamp', dest: c.expect.dest, at }, ctx).state, { t: 'send', at }, ctx).state;
    const unclipped = send(begun, 1000).verdicts[0];
    expect(unclipped).toMatchObject({ correct: false, skipped: ['proc.clip'], stamped: c.expect.dest });
    const clipped = send(stepShift(begun, { t: 'tool', tool: 'clippers', at: 500 }, ctx).state, 1000).verdicts[0];
    expect(clipped?.correct).toBe(true);
    expect(clipped?.skipped).toBeUndefined();
  });
});

describe('Day 11: saga tallies, and forged ones', () => {
  const forged = (x: CaseSpec) => x.lies.some((l) => l.via === 'tally');

  it('trusts an honest tally at level 3', () => {
    const { c, ctx } = findCase(11, (x) => !forged(x) && x.evidence.fields.some((f) => f.item === 'tally'));
    const line = c.evidence.fields.find((f) => f.item === 'tally' && f.says) as Field;
    const says = line.says as { fact: string; value: string | number | boolean };
    const onlyTally = solve([line], ctx);
    expect(onlyTally.beliefs.get(says.fact)).toMatchObject({ values: [says.value], level: 3, support: [line.id] });
  });

  it('shows every forgery a sign under the lens and a cue to look, and voids the tally once seen', () => {
    const { c, ctx } = findCase(11, forged);
    const lie = c.lies.find((l) => l.via === 'tally');
    const tell = c.evidence.fields.find((f) => f.tell !== undefined);
    expect(tell).toMatchObject({ item: 'tally', tool: 'runeLens' });
    expect(tell && isPerceivable(tell, ctx)).toBe(true);
    expect(c.evidence.fields.some((f) => f.cue?.key === 'freshCarving')).toBe(true);
    // The forged line alone would be believed; with its tell beside it, it counts for nothing.
    const line = c.evidence.fields.find((f) => f.id === lie?.field) as Field;
    const fact = lie?.fact ?? '';
    expect(solve([line], ctx).beliefs.get(fact)?.values).toEqual([lie?.claimed]);
    expect(solve([line, tell as Field], ctx).beliefs.get(fact)?.level ?? 0).toBeLessThan(3);
  });

  it('believes a tally whole or not at all: lines that can’t all be true count for nothing', () => {
    // From a CI counterexample: no front wounds seen, the back not yet turned over. "Never fled" means no
    // back wound either, so "fell in battle" can't also be true; neither line may decide the soul.
    const ctx = createDayContext(full, 11, 'whole');
    const body = (key: string, value: string | number): Field => ({
      id: `body.front.${key}`,
      item: 'body',
      view: 'front',
      salience: 3,
      cost: 1,
      obs: { key, value },
    });
    const line = (i: number, fact: string, value: string | boolean): Field => ({
      id: `tally.${i}`,
      item: 'tally',
      salience: 3,
      cost: 2,
      says: { fact, value },
    });
    // Everything else Day 11 asks about is in view (Freyja's whim, the nails), so only the tally is in question.
    const seen = [
      body('grip', 'weapon'),
      body('gripHand', 'right'),
      body('woundsFront', 0),
      body('hair', 'fair'),
      body('ornament', 'none'),
      { ...body('nails', 0), obs: { key: 'nails', value: false } },
    ];
    // Either line alone leaves the soul open (how did they die?); together they'd wrongly say Valhalla.
    expect(solve([...seen, line(0, 'fled', false)], ctx).judgment.kind).toBe('undetermined');
    const both = [...seen, line(0, 'fled', false), line(1, 'cause', 'battle')];
    expect(solve(both, ctx).judgment.kind).toBe('undetermined');
    expect(oracleSolve(both, ctx).kind).toBe('undetermined');
    const causeOnly = solve([...seen, line(1, 'cause', 'battle')], ctx);
    expect(causeOnly.beliefs.get('cause')).toMatchObject({ values: ['battle'], level: 3 });
  });

  it('rejects a forged tally with no sign, or with no cue to look for one', () => {
    const { c, ctx } = findCase(11, forged);
    const noTell = revalidate(
      c,
      ctx,
      c.evidence.fields.filter((f) => f.tell === undefined),
    );
    expect(noTell).toMatchObject({ ok: false, code: 'HIDDEN_FORGERY' });
    const noCue = revalidate(
      c,
      ctx,
      c.evidence.fields.filter((f) => f.cue?.key !== 'freshCarving'),
    );
    expect(noCue).toMatchObject({ ok: false, code: 'CUE_MISSING' });
  });

  it('a questioned forger answers about the tally, not a spoken lie', () => {
    const { c } = findCase(11, (x) => x.lies.some((l) => l.via === 'tally' && l.onQuestion === 'confess'));
    const lie = c.lies.find((l) => l.via === 'tally');
    const answer = questionResponse(c, lie?.field ?? '', full);
    expect(answer?.template).toBe('q.tally.confess');
    expect(answer?.reveals).toEqual([{ fact: lie?.fact, value: lie?.truth }]);
  });

  it('never has a soul say aloud what its forged tally lies about', () => {
    for (let s = 0; s < 30; s++) {
      const ctx = createDayContext(full, 11, `quiet-${s}`);
      for (const c of generateDay(`quiet-${s}`, ctx).cases) {
        for (const lie of c.lies.filter((l) => l.via === 'tally')) {
          expect(c.evidence.fields.some((f) => f.item === 'testimony' && f.says?.fact === lie.fact)).toBe(false);
        }
      }
    }
  });
});
