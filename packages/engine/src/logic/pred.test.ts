import { describe, expect, it } from 'vitest';
import type { Pred, Value } from '../content/types';
import { eval2, eval3, factsIn, type Tri } from './pred';

const ctx = {
  predicates: new Map<string, Pred>([['pred.big', { fact: 'n', gte: 5 }]]),
  params: { whim: { fact: 'hair', is: 'red' } as Pred },
};

describe('eval2', () => {
  const t = { cause: 'battle', n: 7, hair: 'red', alive: false };
  it('evaluates facts, combinators, refs and params', () => {
    expect(eval2({ fact: 'cause', is: 'battle' }, t, ctx)).toBe(true);
    expect(eval2({ fact: 'cause', in: ['sickness', 'oldAge'] }, t, ctx)).toBe(false);
    expect(eval2({ fact: 'n', gte: 5, lte: 7 }, t, ctx)).toBe(true);
    expect(eval2({ all: [{ ref: 'pred.big' }, { param: 'whim' }] }, t, ctx)).toBe(true);
    expect(eval2({ any: [{ fact: 'alive', is: true }, { not: { fact: 'n', lte: 3 } }] }, t, ctx)).toBe(true);
    expect(eval2({ always: true }, t, ctx)).toBe(true);
  });
  it('treats missing refs, params and facts as false', () => {
    expect(eval2({ ref: 'pred.none' }, t, ctx)).toBe(false);
    expect(eval2({ param: 'nothing' }, t, ctx)).toBe(false);
    expect(eval2({ fact: 'ghost', is: 1 }, t, ctx)).toBe(false);
  });
});

describe('eval3 (Kleene)', () => {
  // x is T with {a}, F with {b}, U with {a, b}.
  const valuesFor: Record<Tri, Value[]> = { T: ['a'], F: ['b'], U: ['a', 'b'] };
  const leaf = (name: string): Pred => ({ fact: name, is: 'a' });
  const tris: Tri[] = ['T', 'F', 'U'];
  const and: Record<string, Tri> = { TT: 'T', TF: 'F', TU: 'U', FT: 'F', FF: 'F', FU: 'F', UT: 'U', UF: 'F', UU: 'U' };
  const or: Record<string, Tri> = { TT: 'T', TF: 'T', TU: 'T', FT: 'T', FF: 'F', FU: 'U', UT: 'T', UF: 'U', UU: 'U' };

  for (const x of tris) {
    for (const y of tris) {
      it(`all/any of ${x} and ${y}`, () => {
        const values = (f: string) => (f === 'x' ? valuesFor[x] : valuesFor[y]);
        expect(eval3({ all: [leaf('x'), leaf('y')] }, values, ctx)).toBe(and[x + y]);
        expect(eval3({ any: [leaf('x'), leaf('y')] }, values, ctx)).toBe(or[x + y]);
      });
    }
    it(`not ${x}`, () => {
      expect(eval3({ not: leaf('x') }, () => valuesFor[x], ctx)).toBe(x === 'T' ? 'F' : x === 'F' ? 'T' : 'U');
    });
  }

  it('handles numeric ranges over sets', () => {
    expect(eval3({ fact: 'n', gte: 1 }, () => [1, 2, 3], ctx)).toBe('T');
    expect(eval3({ fact: 'n', gte: 2 }, () => [1, 2, 3], ctx)).toBe('U');
    expect(eval3({ fact: 'n', gte: 4 }, () => [1, 2, 3], ctx)).toBe('F');
    expect(eval3({ fact: 'n', in: [1, 2] }, () => [], ctx)).toBe('F');
  });
});

describe('factsIn', () => {
  it('follows refs and params', () => {
    const facts = factsIn({ all: [{ ref: 'pred.big' }, { not: { param: 'whim' } }, { fact: 'cause', is: 'x' }] }, ctx);
    expect([...facts].sort()).toEqual(['cause', 'hair', 'n']);
  });
});
