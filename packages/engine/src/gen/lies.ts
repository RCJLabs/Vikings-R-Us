import type { ArchetypeDef, Knobs, QuestionKind, Value } from '../content/types';
import type { DayCtx } from '../logic/context';
import type { Truth } from '../logic/pred';
import type { Rng } from '../rng/rng';
import { weightedPick } from './pick';
import type { Lie } from './types';

/** A lie before it has a testimony line (the renderer fills in `field`). */
export type PlannedLie = Omit<Lie, 'field'>;

const KINDS: readonly QuestionKind[] = ['confess', 'excuse', 'insist', 'deflect'];

export function pickLies(arch: ArchetypeDef, truth: Truth, ctx: DayCtx, knobs: Knobs, rng: Rng): PlannedLie[] {
  const out: PlannedLie[] = [];
  for (const spec of arch.lies) {
    if (out.length >= knobs.maxLies) break;
    if (spec.since !== undefined && spec.since > ctx.day) continue;
    const af = ctx.facts.get(spec.fact);
    if (!af || af.pinned || !af.values.includes(spec.claim)) continue;
    const actual = truth[spec.fact] as Value;
    if (actual === spec.claim) continue;
    const p = Math.min(100, Math.floor((spec.p * knobs.lieRate) / 100));
    if (!rng.chance(Math.max(0, p), 100)) continue;
    const onQuestion = weightedPick(
      KINDS,
      KINDS.map((k) => spec.onQuestion[k] ?? 0),
      rng,
    );
    out.push({
      fact: spec.fact,
      claimed: spec.claim,
      truth: actual,
      motive: spec.motive,
      onQuestion,
      reveals: onQuestion === 'confess' ? [spec.fact] : [],
      ...(spec.via ? { via: spec.via } : {}),
    });
  }
  return out;
}
