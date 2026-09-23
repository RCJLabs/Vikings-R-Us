import { loadContent, oracleSolve } from '@cots/testkit';
import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { createDayContext } from '../logic/context';
import { solve } from '../logic/solver';
import { questionResponse } from '../narrative/questions';
import { Rng } from '../rng/rng';
import { generateCaseAt, generateDay, tierKnobs } from './generate';
import type { CaseSpec, Field } from './types';
import { validateCase } from './validate';

const content = loadContent('dev-full');
const seedArb = fc.string({ minLength: 1, maxLength: 12 });
const dayArb = fc.integer({ min: 1, max: 5 });
const RUNS = Number(process.env.FAIRNESS_RUNS ?? 150);

const revalidate = (
  c: CaseSpec,
  ctx: ReturnType<typeof createDayContext>,
  fields: readonly Field[] = c.evidence.fields,
) =>
  validateCase(
    { ...c.evidence, fields },
    c.truth,
    c.lies,
    c.expect,
    c.meta.decisive,
    ctx,
    tierKnobs(c.meta.tier, ctx.spec.queue.knobs),
  );

describe('fairness contract (F1–F8)', () => {
  test.prop([seedArb, dayArb], { numRuns: RUNS })('every generated soul passes validation', (seed, day) => {
    const ctx = createDayContext(content, day, seed);
    for (const c of generateDay(seed, ctx).cases) {
      const v = revalidate(c, ctx);
      expect(v.ok ? 'ok' : `${v.code}: ${v.detail}`).toBe('ok');
    }
  });

  test.prop([seedArb, dayArb], { numRuns: RUNS })('the brute-force oracle agrees with the solver', (seed, day) => {
    const ctx = createDayContext(content, day, seed);
    for (const c of generateDay(seed, ctx).cases) {
      const s = solve(c.evidence.fields, ctx).judgment;
      expect(s.kind).toBe('determined');
      if (s.kind === 'determined')
        expect(oracleSolve(c.evidence.fields, ctx)).toEqual({ kind: 'determined', dest: s.dest });
    }
  });

  test.prop([seedArb, dayArb, fc.integer()], { numRuns: RUNS })(
    'on partial evidence the solver is never more certain than the oracle',
    (seed, day, pick) => {
      const ctx = createDayContext(content, day, seed);
      const rng = new Rng(`subset|${pick}`);
      for (const c of generateDay(seed, ctx).cases) {
        const subset = c.evidence.fields.filter(() => rng.chance(1, 2));
        const s = solve(subset, ctx).judgment;
        if (s.kind === 'determined') expect(oracleSolve(subset, ctx)).toEqual({ kind: 'determined', dest: s.dest });
      }
    },
  );
});

describe('determinism', () => {
  test.prop([seedArb, dayArb], { numRuns: 40 })('a day is a pure function of (seed, day)', (seed, day) => {
    const a = generateDay(seed, createDayContext(content, day, seed));
    const b = generateDay(seed, createDayContext(content, day, seed));
    expect(b.cases).toEqual(a.cases);
  });

  test.prop([seedArb, dayArb], { numRuns: 40 })('each soul can be generated on its own', (seed, day) => {
    const ctx = createDayContext(content, day, seed);
    generateDay(seed, ctx).cases.forEach((c, i) => {
      expect(generateCaseAt(seed, ctx, i).case).toEqual(c);
    });
  });

  it('names are unique within a day', () => {
    for (let day = 1; day <= 5; day++) {
      const ctx = createDayContext(content, day, 'names');
      const names = generateDay('names', ctx).cases.map((c) => `${c.evidence.look.name}`);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe('metamorphic', () => {
  test.prop([seedArb, dayArb, seedArb], { numRuns: 40 })(
    'changing only the cosmetic look never changes the judgment',
    (seed, day, lookSeed) => {
      const ctx = createDayContext(content, day, seed);
      generateDay(seed, ctx).cases.forEach((a, i) => {
        const b = generateCaseAt(seed, ctx, i, { lookSeed }).case;
        expect(b.truth).toEqual(a.truth);
        expect(b.expect).toEqual(a.expect);
        expect(b.meta.proof).toEqual(a.meta.proof);
        expect(b.lies.map(({ field, fact, claimed }) => [field, fact, claimed])).toEqual(
          a.lies.map(({ field, fact, claimed }) => [field, fact, claimed]),
        );
      });
    },
  );

  test.prop([seedArb, dayArb, fc.integer()], { numRuns: 40 })(
    'field order and decoy cues never change the solver',
    (seed, day, shuffleSeed) => {
      const ctx = createDayContext(content, day, seed);
      for (const c of generateDay(seed, ctx).cases) {
        const base = solve(c.evidence.fields, ctx);
        const shuffled = solve(new Rng(`${shuffleSeed}`).shuffle(c.evidence.fields), ctx);
        expect(shuffled.judgment).toEqual(base.judgment);
        expect(shuffled.contradictions.map((x) => x.lie).sort()).toEqual(base.contradictions.map((x) => x.lie).sort());
        if (day >= 3) {
          const decoy: Field = {
            id: 'cue.breathFog',
            item: 'body',
            view: 'front',
            salience: 2,
            cost: 0,
            cue: { key: 'breathFog' },
          };
          expect(solve([...c.evidence.fields, decoy], ctx).judgment).toEqual(base.judgment);
        }
      }
    },
  );
});

/** Generated souls for a day range, for adversarial edits. */
function sample(days: number[], seeds: number) {
  const out: { c: CaseSpec; ctx: ReturnType<typeof createDayContext> }[] = [];
  for (const day of days) {
    for (let s = 0; s < seeds; s++) {
      const ctx = createDayContext(content, day, `adv-${s}`);
      for (const c of generateDay(`adv-${s}`, ctx).cases) out.push({ c, ctx });
    }
  }
  return out;
}

describe('adversarial: the validator rejects broken souls', () => {
  const souls = sample([1, 2, 3, 4, 5], 12);

  it('removing any single field from the minimal proof leaves the soul undecidable', () => {
    let checked = 0;
    for (const { c, ctx } of souls) {
      for (const drop of c.meta.proof) {
        const fields = c.evidence.fields.filter((f) => c.meta.proof.includes(f.id) && f.id !== drop);
        const v = revalidate(c, ctx, fields);
        expect(v.ok ? 'ok' : v.code).toMatch(/^(UNDETERMINED|WRONG_DEST)$/);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('a soul that is secretly alive needs its breath-fog cue', () => {
    const alive = souls.filter(({ c }) => c.expect.dest === 'RETURN');
    expect(alive.length).toBeGreaterThan(5);
    for (const { c, ctx } of alive) {
      const v = revalidate(
        c,
        ctx,
        c.evidence.fields.filter((f) => f.id !== 'cue.breathFog'),
      );
      expect(v.ok ? 'ok' : v.code).toBe('CUE_MISSING');
    }
  });

  it('a body that misreports the truth is unsound', () => {
    for (const { c, ctx } of souls.slice(0, 40)) {
      const fields = c.evidence.fields.map((f) =>
        f.id === 'body.front.grip' && f.obs
          ? { ...f, obs: { ...f.obs, value: f.obs.value === 'weapon' ? 'none' : 'weapon' } }
          : f,
      );
      const v = revalidate(c, ctx, fields);
      expect(v.ok ? 'ok' : v.code).toBe('UNSOUND');
    }
  });

  it('a raven that lies is unsound', () => {
    for (const { c, ctx } of souls.slice(0, 40)) {
      const lie: Field = {
        id: 'huginn.9',
        item: 'huginn',
        salience: 3,
        cost: 2,
        says: { fact: 'grip', value: c.truth.grip === 'weapon' ? 'none' : 'weapon' },
      };
      const v = revalidate(c, ctx, [...c.evidence.fields, lie]);
      expect(v.ok ? 'ok' : v.code).toBe('UNSOUND');
    }
  });

  it('an outcome-changing lie with no contradiction is caught', () => {
    let checked = 0;
    for (const { c, ctx } of souls) {
      const lie = c.lies.find((l) => l.fact === 'cause' && c.truth.grip === 'weapon');
      const identity = c.evidence.fields.find((f) => f.item === 'testimony' && !f.says);
      if (!lie || !identity) continue;
      const fields = c.evidence.fields.filter((f) => f.id !== lie.field);
      const moved = { ...c, lies: c.lies.map((l) => (l === lie ? { ...l, field: identity.id } : l)) };
      const v = revalidate(moved, ctx, fields);
      expect(v.ok ? 'ok' : v.code).toBe('HIDDEN_LIE');
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
  });

  it('enforces effort, tool, visibility, document and content limits', () => {
    const withTool = souls.find(({ c }) => c.meta.proof.includes('tool.feather.breath'));
    const subtle = souls.find(({ c, ctx }) =>
      c.meta.proof.some((id) => (c.evidence.fields.find((f) => f.id === id)?.salience ?? 3) < 3 && ctx.day >= 1),
    );
    const any = souls[0];
    if (!withTool || !subtle || !any) throw new Error('sample too small');
    const check = (
      s: typeof any,
      knobs: Partial<ReturnType<typeof tierKnobs>>,
      look?: Partial<CaseSpec['evidence']['look']>,
    ) =>
      validateCase(
        { ...s.c.evidence, look: { ...s.c.evidence.look, ...look } },
        s.c.truth,
        s.c.lies,
        s.c.expect,
        s.c.meta.decisive,
        s.ctx,
        { ...tierKnobs(s.c.meta.tier, s.ctx.spec.queue.knobs), ...knobs },
      );
    const code = (v: ReturnType<typeof check>) => (v.ok ? 'ok' : v.code);
    expect(code(check(withTool, { proofCostS: [0, 0] }))).toBe('EFFORT_BAND');
    expect(code(check(withTool, { maxTools: 0 }))).toBe('TOO_MANY_TOOLS');
    expect(code(check(subtle, { salienceFloor: 3 }))).toBe('SALIENCE_FLOOR');
    expect(code(check(any, { maxDocs: 1 }))).toBe('TOO_MANY_DOCS');
    expect(code(check(any, {}, { age: 12 }))).toBe('CONTENT_RULE');
  });
});

describe('questioning', () => {
  const souls = sample([1, 2, 3, 4, 5], 8);

  it('every contradiction gets an answer that matches the planned response', () => {
    let answered = 0;
    for (const { c, ctx } of souls) {
      for (const x of solve(c.evidence.fields, ctx).contradictions) {
        const lie = c.lies.find((l) => l.field === x.lie);
        const r = questionResponse(c, x.lie, content);
        expect(r?.kind).toBe(lie?.onQuestion);
        expect(r?.lines.length).toBeGreaterThan(0);
        if (lie?.onQuestion === 'confess') expect(r?.reveals).toEqual([{ fact: lie.fact, value: lie.truth }]);
        answered++;
      }
    }
    expect(answered).toBeGreaterThan(50);
  });

  it('prefers the most specific template and is deterministic', () => {
    const braggart = souls.find(
      ({ c }) =>
        c.evidence.persona === 'braggart' &&
        c.lies.some(
          (l) => l.fact === 'cause' && l.onQuestion === 'confess' && ['sickness', 'oldAge'].includes(String(l.truth)),
        ),
    );
    if (!braggart) throw new Error('no confessing braggart in the sample');
    const lie = braggart.c.lies.find((l) => l.fact === 'cause') as CaseSpec['lies'][number];
    const r = questionResponse(braggart.c, lie.field, content);
    expect(r?.template).toBe('q.cause.braggart.confess');
    expect(questionResponse(braggart.c, lie.field, content)).toEqual(r);
  });
});
