import { fnv1a32 } from './hash';

/** splitmix32: expands one 32-bit seed into well-mixed state words. */
function splitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

const TWO_POW_32 = 0x1_0000_0000;

/**
 * Seeded PRNG (sfc32). Integer-only, so a seed produces the same sequence in
 * every JS engine; that is what keeps a Daily identical on every device.
 */
export class Rng {
  readonly seed: string;
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string) {
    this.seed = seed;
    const mix = splitmix32(fnv1a32(seed));
    this.a = mix();
    this.b = mix();
    this.c = mix();
    this.d = mix();
    for (let i = 0; i < 12; i++) this.nextU32(); // discard warm-up outputs
  }

  /** Next raw unsigned 32-bit integer. */
  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform integer in [min, max], inclusive, without modulo bias. */
  int(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) {
      throw new RangeError(`Bad range [${min}, ${max}]`);
    }
    const span = max - min + 1;
    if (span > TWO_POW_32) throw new RangeError('Range is wider than 2^32');
    const limit = TWO_POW_32 - (TWO_POW_32 % span);
    for (;;) {
      const x = this.nextU32();
      if (x < limit) return min + (x % span);
    }
  }

  /** True with probability num/den (integers, 0 <= num <= den). */
  chance(num: number, den: number): boolean {
    if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || den < 1 || num < 0 || num > den) {
      throw new RangeError(`Bad odds ${num}/${den}`);
    }
    return this.int(1, den) <= num;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Cannot pick from an empty list');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Fisher–Yates shuffle into a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  /**
   * An independent child stream, e.g. `rng.fork('look')` vs `rng.fork('truth')`.
   * Depends only on the seed, never on how many numbers were drawn.
   */
  fork(label: string | number): Rng {
    return new Rng(`${this.seed}\u001f${label}`);
  }
}
