import type { GuardResult } from '@cots/engine';
import type { BuildInfo, ShiftRecord } from './telemetry-payload';

/**
 * Transport for the opt-in alpha telemetry (docs/privacy.md). Fire and
 * forget: a text/plain POST (no CORS preflight, no cookies), kept alive
 * through page unloads. Failures are ignored; the game never waits on it.
 */
/** `base` may carry a path (`https://host/prefix/`); `new URL('/v1/…', base)` would drop it. */
export const endpoint = (base: string, path: string): string => `${base.replace(/\/+$/, '')}${path}`;

function post(base: string, path: string, body: unknown): void {
  try {
    void fetch(endpoint(base, path), {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'text/plain' },
      credentials: 'omit',
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Bad URL or no fetch: nothing to do.
  }
}

export function sendShift(base: string, record: ShiftRecord): void {
  post(base, '/v1/shift', record);
}

export interface GuardRecord {
  readonly v: 1;
  readonly build: BuildInfo;
  readonly n: number;
  readonly expected: string;
  readonly got: string;
  readonly ua: string;
}

export function sendGuard(base: string, record: GuardRecord): void {
  post(base, '/v1/guard', record);
}

export type { GuardResult };
