import { dailySeed, inspectable, type ShiftAction, startShift, stepShift } from '@cots/engine';
import { loadDailyContent } from '@cots/testkit';
import { describe, expect, it } from 'vitest';
import { shiftRecord } from '../../../packages/ui/src/telemetry-payload';
import type { D1Like, D1Statement } from './db';
import { allowedOrigin, type Env, handle, MAX_BODY_BYTES } from './worker';

/** A fake D1 that records every statement a batch runs. */
function fakeDb() {
  const rows: { sql: string; values: unknown[] }[] = [];
  const db: D1Like = {
    prepare(sql) {
      const stmt: D1Statement & { sql: string; values: unknown[] } = {
        sql,
        values: [],
        bind(...values) {
          stmt.values = values;
          return stmt;
        },
      };
      return stmt;
    },
    async batch(statements) {
      for (const s of statements as unknown as { sql: string; values: unknown[] }[]) rows.push(s);
      return [];
    },
  };
  return { db, rows };
}

const ORIGINS = 'https://rcjlabs.github.io,https://*.itch.zone';
const deps = { newId: () => 'id-1', today: () => '2026-09-23' };
const post = (path: string, body: string, origin: string | null = 'https://rcjlabs.github.io') =>
  new Request(`https://t.example${path}`, {
    method: 'POST',
    body,
    headers: { 'content-type': 'text/plain', ...(origin ? { origin } : {}) },
  });

/** A real record: Daily #3 played by a careful player, built by the game's own code. */
function playedRecord() {
  const content = loadDailyContent();
  const { state, ctx } = startShift(content, { mode: 'daily', seed: dailySeed(3), day: 5, dailyNumber: 3 });
  const actions: ShiftAction[] = [];
  let s = state;
  const push = (a: ShiftAction) => {
    actions.push(a);
    s = stepShift(s, a, ctx).state;
  };
  push({ t: 'begin', at: 0 });
  let at = 0;
  while (s.phase === 'shift') {
    at += 4_000;
    push({ t: 'inspect', fields: inspectable(s, ctx).map((f) => f.id), at });
    push({ t: 'flip', at });
    const c = s.cases[s.cursor];
    push({ t: 'stamp', dest: c?.expect.dest ?? 'HEL', at });
    push({ t: 'send', at });
  }
  return shiftRecord({
    build: { target: 'web-demo', content: 'c0d5fc27', g: content.genVersion },
    mode: 'daily',
    n: 3,
    layout: 'drawer',
    guard: 'ok',
    initial: state,
    actions,
    ctx,
  });
}

describe('telemetry worker', () => {
  it('stores a shift the game actually builds, one row per soul', async () => {
    const { db, rows } = fakeDb();
    const record = playedRecord();
    const res = await handle(post('/v1/shift', JSON.stringify(record)), { DB: db, ALLOWED_ORIGINS: ORIGINS }, deps);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://rcjlabs.github.io');
    expect(rows).toHaveLength(1 + record.souls.length);
    expect(rows[0]?.values.slice(0, 7)).toEqual(['id-1', '2026-09-23', 'web-demo', 'c0d5fc27', 1, 'daily', 3]);
    const soul = rows[1]?.values ?? [];
    expect(soul[0]).toBe('id-1');
    expect(String(soul[11])).toMatch(/grip|skin|hair/); // looked: kinds of sign, never their values
  });

  it('rejects anything that is not a well-formed record', async () => {
    const { db, rows } = fakeDb();
    const env: Env = { DB: db, ALLOWED_ORIGINS: ORIGINS };
    const record = playedRecord();
    const bad = [
      '{not json',
      JSON.stringify({ ...record, name: 'Astrid' }),
      JSON.stringify({ ...record, souls: [{ ...record.souls[0], rule: 'free text with spaces' }] }),
      JSON.stringify({ ...record, v: 2 }),
    ];
    for (const body of bad) expect((await handle(post('/v1/shift', body), env, deps)).status).toBe(400);
    expect((await handle(post('/v1/shift', 'x'.repeat(MAX_BODY_BYTES + 1)), env, deps)).status).toBe(413);
    expect((await handle(post('/v1/other', '{}'), env, deps)).status).toBe(404);
    expect(rows).toEqual([]);
  });

  it('only takes posts from the game’s own sites', async () => {
    const { db } = fakeDb();
    const env: Env = { DB: db, ALLOWED_ORIGINS: ORIGINS };
    const body = JSON.stringify(playedRecord());
    expect((await handle(post('/v1/shift', body, 'https://evil.example'), env, deps)).status).toBe(403);
    expect((await handle(post('/v1/shift', body, 'https://html-classic.itch.zone'), env, deps)).status).toBe(204);
    expect(allowedOrigin('https://itch.zone', ORIGINS)).toBeNull();
    expect(allowedOrigin('http://html.itch.zone', ORIGINS)).toBeNull();
    expect(allowedOrigin('https://a.b.itch.zone', ORIGINS)).toBe('https://a.b.itch.zone');
  });

  it('stores Daily checksum mismatches with the browser that saw them', async () => {
    const { db, rows } = fakeDb();
    const guard = {
      v: 1,
      build: { target: 'web-itch', content: 'c0d5fc27', g: 1 },
      n: 12,
      expected: 'd43bbf21',
      got: '0badf00d',
      ua: 'Mozilla/5.0 (test)',
    };
    const res = await handle(post('/v1/guard', JSON.stringify(guard)), { DB: db, ALLOWED_ORIGINS: ORIGINS }, deps);
    expect(res.status).toBe(204);
    expect(rows[0]?.values).toEqual([
      'id-1',
      '2026-09-23',
      'web-itch',
      'c0d5fc27',
      1,
      12,
      'd43bbf21',
      '0badf00d',
      'Mozilla/5.0 (test)',
    ]);
  });

  it('answers health checks and preflights', async () => {
    const { db } = fakeDb();
    const env: Env = { DB: db, ALLOWED_ORIGINS: ORIGINS };
    expect((await handle(new Request('https://t.example/v1/health'), env, deps)).status).toBe(200);
    const pre = await handle(
      new Request('https://t.example/v1/shift', {
        method: 'OPTIONS',
        headers: { origin: 'https://rcjlabs.github.io' },
      }),
      env,
      deps,
    );
    expect(pre.status).toBe(204);
  });
});
