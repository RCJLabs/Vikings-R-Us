import type { GuardRecordIn, ShiftRecordIn } from './schema';

/** The part of Cloudflare's D1 binding this Worker uses. */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
}
export interface D1Like {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
}

const flag = (b: boolean): number => (b ? 1 : 0);

/** Stores a shift and its souls in one batch (D1 runs a batch as a transaction). */
export async function insertShift(db: D1Like, id: string, on: string, r: ShiftRecordIn): Promise<void> {
  const shift = db
    .prepare(
      `INSERT INTO shifts (id, received_on, target, content, g, mode, n, day, layout, untimed, sun_ms, ended_by, guard, correct, total, spare_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      on,
      r.build.target,
      r.build.content,
      r.build.g,
      r.mode,
      r.n ?? null,
      r.day,
      r.layout,
      flag(r.untimed),
      r.sunMs,
      r.endedBy,
      r.guard,
      r.correct,
      r.total,
      r.spareMs,
    );
  const souls = r.souls.map((s) =>
    db
      .prepare(
        `INSERT INTO souls (shift_id, i, arch, rule, expected, stamped, correct, sun_ms, penalty_ms, flipped, tools, looked, missed, lies, caught, questioned, bad_compares, difficulty, proof_cost_s)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        s.i,
        s.arch,
        s.rule,
        s.expected,
        s.stamped,
        flag(s.correct),
        s.sunMs,
        s.penaltyMs,
        flag(s.flipped),
        s.tools.join(','),
        s.looked.join(','),
        s.missed.join(','),
        s.lies,
        s.caught,
        s.questioned,
        s.badCompares,
        s.difficulty,
        s.proofCostS,
      ),
  );
  await db.batch([shift, ...souls]);
}

export async function insertGuard(db: D1Like, id: string, on: string, r: GuardRecordIn): Promise<void> {
  await db.batch([
    db
      .prepare(
        'INSERT INTO guard_mismatches (id, received_on, target, content, g, n, expected, got, ua) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(id, on, r.build.target, r.build.content, r.build.g, r.n, r.expected, r.got, r.ua),
  ]);
}
