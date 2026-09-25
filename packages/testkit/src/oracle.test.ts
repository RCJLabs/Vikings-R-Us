import { createDayContext, type Field, generateDay, Rng, soulCtx } from '@cots/engine';
import { describe, expect, it } from 'vitest';
import { loadContent } from './content';
import { oracleSolve } from './oracle';
import { oracleSolveReference } from './oracle-reference';

// `oracleSolve` skips facts that can't change the answer; the reference enumerates everything. They must agree
// on every evidence set: whole cases, random parts of them, and evidence broken so it can't all be true.
const content = loadContent('dev-full');
// The reference is exponential in the open facts: up to a second a soul on Days 10-12 and hopeless after, so
// the comparison stops at Day 12. Those days already have every kind of check the oracle groups by (fact
// laws, a derived fact, tallies, presumptions, day parameters).
const DAYS = content.days.map((d) => d.day).filter((d) => d <= 12);
const SEEDS = (day: number) => (day >= 10 ? 1 : 3);

/** Variants of a case's evidence: all of it, random halves, and a raven or a body sign that lies. */
function variants(fields: readonly Field[], rng: Rng): Field[][] {
  const out: Field[][] = [fields.slice()];
  for (let i = 0; i < 3; i++) out.push(fields.filter(() => rng.chance(1, 2)));
  const obs = fields.find((f) => f.obs && typeof f.obs.value === 'number');
  const shown = obs?.obs;
  if (obs && shown) out.push(fields.map((f) => (f === obs ? { ...f, obs: { ...shown, value: 99 } } : f)));
  const raven = fields.find((f) => (f.item === 'huginn' || f.item === 'muninn') && f.says && f.says.value !== null);
  if (raven?.says) {
    const says = raven.says;
    out.push(
      fields.map((f) =>
        f === raven
          ? { ...f, says: { fact: says.fact, value: typeof says.value === 'boolean' ? !says.value : 'x' } }
          : f,
      ),
    );
  }
  return out;
}

describe('the oracle', () => {
  it('gives the reference answer on every evidence set, every day', () => {
    let compared = 0;
    let undetermined = 0;
    for (const day of DAYS) {
      for (let s = 0; s < SEEDS(day); s++) {
        const seed = `oracle-${day}-${s}`;
        const ctx = createDayContext(content, day, seed);
        const rng = new Rng(`${seed}|variants`);
        for (const c of generateDay(seed, ctx).cases) {
          const cx = soulCtx(ctx, c);
          for (const fields of variants(c.evidence.fields, rng)) {
            const want = oracleSolveReference(fields, cx);
            expect(oracleSolve(fields, cx), `day ${day} ${seed} ${c.evidence.look.name}`).toEqual(want);
            compared++;
            if (want.kind === 'undetermined') undetermined++;
          }
        }
      }
    }
    // Both answers must be exercised.
    expect(compared).toBeGreaterThan(500);
    expect(undetermined).toBeGreaterThan(50);
    expect(compared - undetermined).toBeGreaterThan(200);
  }, 120_000);
});
