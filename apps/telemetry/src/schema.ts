import { z } from 'zod';

/*
 * What the game may send (packages/ui/src/telemetry-payload.ts builds it).
 * Everything is bounded: short identifiers, small integers, enums. Anything
 * else is rejected, so free text or identifying data can't slip in.
 */
const Ident = z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/);
const Dest = z.enum(['VALHALLA', 'FOLKVANGR', 'HEL', 'RAN', 'RETURN', 'DETAIN', 'TRANSFER']);
const Ms = z
  .number()
  .int()
  .min(0)
  .max(24 * 60 * 60 * 1000);
const Small = z.number().int().min(0).max(1000);
const Kinds = z.array(Ident).max(32);

const Build = z.strictObject({
  target: Ident,
  content: z.string().regex(/^[0-9a-f]{8}$/),
  g: z.number().int().min(0).max(10_000),
});

const Soul = z.strictObject({
  i: Small,
  arch: Ident,
  rule: Ident,
  expected: Dest,
  stamped: Dest.nullable(),
  correct: z.boolean(),
  sunMs: Ms,
  penaltyMs: Ms,
  flipped: z.boolean(),
  tools: z.array(z.enum(['flip', 'feather', 'runeLens', 'clippers'])).max(4),
  looked: Kinds,
  missed: Kinds,
  lies: Small,
  caught: Small,
  questioned: Small,
  badCompares: Small,
  difficulty: Small,
  proofCostS: Small,
});

export const ShiftRecordSchema = z.strictObject({
  v: z.literal(1),
  build: Build,
  mode: z.enum(['daily', 'practice', 'primer']),
  n: z.number().int().min(-100_000).max(100_000).optional(),
  day: z.number().int().min(1).max(20),
  layout: z.enum(['desk', 'drawer']),
  untimed: z.boolean(),
  sunMs: Ms,
  endedBy: z.enum(['queue', 'dusk']),
  guard: z.enum(['ok', 'mismatch', 'unchecked']),
  correct: Small,
  total: Small,
  spareMs: Ms,
  souls: z.array(Soul).max(40),
});

/** A device that generated a different Daily than the build's table says it should. */
export const GuardRecordSchema = z.strictObject({
  v: z.literal(1),
  build: Build,
  n: z.number().int().min(-100_000).max(100_000),
  expected: z.string().regex(/^[0-9a-f]{8}$/),
  got: z.string().regex(/^[0-9a-f]{8}$/),
  /** The browser's user-agent string: the one device detail a mismatch needs. */
  ua: z.string().max(400),
});

export type ShiftRecordIn = z.infer<typeof ShiftRecordSchema>;
export type GuardRecordIn = z.infer<typeof GuardRecordSchema>;
