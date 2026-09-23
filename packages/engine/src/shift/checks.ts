import { dailySeed } from '../calendar';
import type { Content } from '../content/types';
import { queueChecksum, startShift } from './shift';

/**
 * The Daily checksum guard (docs/tech-spec.md §11, M3). Builds ship a table
 * of the checksum every Daily should have, computed at build time. Each
 * device recomputes its Daily and compares, so a browser that generates a
 * different Daily (a JS engine quirk, a stale build) is caught instead of
 * silently scoring a different puzzle.
 */
export interface DailyChecks {
  /** The generator version the table was built with. */
  readonly g: number;
  /** The first Daily number in the table. */
  readonly from: number;
  /** 8 hex characters per Daily, from `from` upward. */
  readonly hashes: string;
}

export type GuardResult = 'ok' | 'mismatch' | 'unchecked';

/** The checksum of Daily #n as this device generates it. */
export function dailyChecksum(content: Content, n: number): string {
  const spec = content.daily;
  if (!spec) throw new Error('This build has no Daily Shift');
  const { state, ctx } = startShift(content, { mode: 'daily', seed: dailySeed(n), day: spec.day, dailyNumber: n });
  return queueChecksum(state.cases, ctx);
}

export function buildDailyChecks(content: Content, from: number, to: number): DailyChecks {
  let hashes = '';
  for (let n = from; n <= to; n++) hashes += dailyChecksum(content, n);
  return { g: content.genVersion, from, hashes };
}

/** The checksum the table expects for Daily #n, if it covers it. */
export function expectedChecksum(checks: DailyChecks | null | undefined, n: number, g: number): string | undefined {
  if (!checks || checks.g !== g) return undefined;
  const at = (n - checks.from) * 8;
  if (at < 0 || at + 8 > checks.hashes.length) return undefined;
  return checks.hashes.slice(at, at + 8);
}

export function guardDaily(checks: DailyChecks | null | undefined, n: number, g: number, got: string): GuardResult {
  const expected = expectedChecksum(checks, n, g);
  if (expected === undefined) return 'unchecked';
  return expected === got ? 'ok' : 'mismatch';
}
