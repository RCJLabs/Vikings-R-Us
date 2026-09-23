import type { Rng } from '../rng/rng';

/** Weighted choice with integer weights. All-zero weights fall back to uniform. */
export function weightedPick<T>(items: readonly T[], weights: readonly number[], rng: Rng): T {
  if (items.length === 0) throw new RangeError('Cannot pick from an empty list');
  let total = 0;
  for (const w of weights) total += w > 0 ? w : 0;
  if (total === 0) return rng.pick(items);
  let r = rng.int(0, total - 1);
  for (let i = 0; i < items.length; i++) {
    const w = weights[i] ?? 0;
    if (w <= 0) continue;
    if (r < w) return items[i] as T;
    r -= w;
  }
  return items[items.length - 1] as T;
}

/** `ceil(a / b)` for non-negative integers, without floating point. */
export const ceilDiv = (a: number, b: number): number => Math.floor((a + b - 1) / b);
