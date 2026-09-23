import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { fnv1a32 } from './hash';
import { Rng } from './rng';

// Reference implementations transcribed from bryc's public-domain JS PRNG collection.
function refSplitmix32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    t = t ^ (t >>> 15);
    return t >>> 0;
  };
}
function refSfc32(a: number, b: number, c: number, d: number) {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
}

const draw = (seed: string, n: number) => {
  const r = new Rng(seed);
  return Array.from({ length: n }, () => r.nextU32());
};

describe('Rng', () => {
  it('produces the pinned sequence (changing this changes every Daily)', () => {
    expect(draw('chooser', 5)).toEqual(GOLDEN_CHOOSER);
  });

  it('matches reference splitmix32 + sfc32', () => {
    const mix = refSplitmix32(fnv1a32('chooser'));
    const ref = refSfc32(mix(), mix(), mix(), mix());
    for (let i = 0; i < 12; i++) ref();
    const r = new Rng('chooser');
    for (let i = 0; i < 100; i++) expect(r.nextU32()).toBe(ref());
  });

  test.prop([fc.string()])('is deterministic for any seed', (seed) => {
    expect(draw(seed, 8)).toEqual(draw(seed, 8));
  });

  it('gives different sequences for different seeds', () => {
    expect(draw('valhalla', 4)).not.toEqual(draw('helheim', 4));
  });

  test.prop([fc.string(), fc.integer({ min: -1_000_000, max: 1_000_000 }), fc.integer({ min: 0, max: 5000 })])(
    'int stays within [min, max]',
    (seed, min, span) => {
      const r = new Rng(seed);
      for (let i = 0; i < 20; i++) {
        const v = r.int(min, min + span);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(min);
        expect(v).toBeLessThanOrEqual(min + span);
      }
    },
  );

  it('int is close to uniform', () => {
    const r = new Rng('uniformity');
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 60_000; i++) counts[r.int(0, 5)]++;
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(500);
  });

  it('chance honours its edges', () => {
    const r = new Rng('odds');
    for (let i = 0; i < 100; i++) {
      expect(r.chance(0, 7)).toBe(false);
      expect(r.chance(7, 7)).toBe(true);
    }
  });

  test.prop([fc.string(), fc.array(fc.integer())])('shuffle returns a permutation', (seed, items) => {
    const shuffled = new Rng(seed).shuffle(items);
    expect([...shuffled].sort((a, b) => a - b)).toEqual([...items].sort((a, b) => a - b));
  });

  it('forks depend on the seed, not on how much was drawn', () => {
    const used = new Rng('run');
    used.nextU32();
    used.nextU32();
    expect(used.fork('look').nextU32()).toBe(new Rng('run').fork('look').nextU32());
    expect(new Rng('run').fork('look').nextU32()).not.toBe(new Rng('run').fork('truth').nextU32());
  });

  it('rejects bad ranges and odds', () => {
    const r = new Rng('x');
    expect(() => r.int(5, 4)).toThrow(RangeError);
    expect(() => r.int(0.5, 3)).toThrow(RangeError);
    expect(() => r.chance(3, 2)).toThrow(RangeError);
    expect(() => r.pick([])).toThrow(RangeError);
  });
});

const GOLDEN_CHOOSER: readonly number[] = [649012885, 3916511693, 756715085, 395601487, 976474342];
