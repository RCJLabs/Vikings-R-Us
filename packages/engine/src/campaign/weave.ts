import type { Content, EventSouls, RuleDef, WeaveDef } from '../content/types';
import { dressForDay } from '../gen/generate';
import type { CaseSpec } from '../gen/types';
import type { DayCtx } from '../logic/context';
import { Rng } from '../rng/rng';
import type { RunState } from './state';

/*
 * The Norns' weave (docs/tech-spec.md §53): for players who have reached an ending, a new run can be begun woven. It
 * draws one weave from its seed: the same rules, in another order in the Order of Judgment, so that where two rules
 * both hold, the other one decides. The weave is the run's from Day 1; it changes a day once two rules in force that
 * day come in another order, and the morning of the first such day says so. Nothing else changes, so every soul is
 * made and proved fair under the rules as the weave orders them.
 */

/** Whether a run can be begun woven: the build has weaving, and one of the endings that open it has been reached. */
export function weaveOpen(content: Content, endingsSeen: readonly string[]): boolean {
  return (content.campaign?.weaving?.after ?? []).some((id) => endingsSeen.includes(id));
}

/** The weave a run begun woven draws from its seed; none when the build has no weaving. */
export function drawWeave(content: Content, seed: string): WeaveDef | undefined {
  const weaves = content.campaign?.weaving?.weaves ?? [];
  return weaves.length > 0 ? new Rng(`${seed}|weave`).pick(weaves) : undefined;
}

/** The run's weave, when it was begun woven. */
export function weaveOf(run: Pick<RunState, 'weave'>, content: Content): WeaveDef | undefined {
  return run.weave ? content.campaign?.weaving?.weaves.find((w) => w.id === run.weave) : undefined;
}

/** A rule where a weave puts it. */
const woven = (r: RuleDef, weave: WeaveDef): RuleDef => {
  const order = weave.order[r.id];
  return order === undefined || order === r.order ? r : { ...r, order, woven: true };
};

// The same content for the same weave, so what's cached per content stays cached.
const wovenCache = new WeakMap<Content, Map<string, Content>>();

/** The content as a weave leaves it: the same in all but its rules' order. */
export function wovenContent(content: Content, weave: WeaveDef | undefined): Content {
  if (!weave) return content;
  const byWeave = wovenCache.get(content) ?? new Map<string, Content>();
  wovenCache.set(content, byWeave);
  const found = byWeave.get(weave.id);
  if (found) return found;
  const made: Content = { ...content, rules: content.rules.map((r) => woven(r, weave)) };
  byWeave.set(weave.id, made);
  return made;
}

const byOrder = (a: RuleDef, b: RuleDef): number => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The rules in force on `day`, in the order they're read. */
function readOrder(rules: readonly RuleDef[], day: number): string[] {
  return rules
    .filter((r) => r.since <= day && (r.until === undefined || day < r.until))
    .sort(byOrder)
    .map((r) => r.id);
}

/**
 * The first day a weave changes: the first on which two rules in force come in another order. Null when it changes
 * none of the build's days.
 */
export function weaveDay(content: Content, weave: WeaveDef): number | null {
  const woven = wovenContent(content, weave);
  const days = content.days.map((d) => d.day).sort((a, b) => a - b);
  for (const day of days) {
    if (readOrder(content.rules, day).join() !== readOrder(woven.rules, day).join()) return day;
  }
  return null;
}

/**
 * The souls a weave brings to `day`: none before the first day it changes, nor on a day with a noon decree, whose
 * raven already changes it.
 */
export function weaveSoulsOn(content: Content, weave: WeaveDef, day: number): EventSouls[] {
  const first = weaveDay(content, weave);
  if (first === null || day < first || content.days.find((d) => d.day === day)?.noon) return [];
  return (weave.souls ?? []).filter((s) => (s.since ?? 1) <= day && (s.until === undefined || day < s.until));
}

/**
 * A soul made under the day's own order, seen under the weave's: the same truth, lies and look, judged and dressed
 * as the line at dusk dresses a soul for a new day (`dressForDay`), so it meets the same contract. A soul made after a
 * noon decree is dressed for the decree's rules. Null if no dressing passes.
 */
export function underWeave(c: CaseSpec, ctx: DayCtx): CaseSpec | null {
  const late = c.noon === true && ctx.noon !== undefined;
  const dressed = dressForDay(c, late && ctx.noon ? ctx.noon.ctx : ctx);
  return dressed && late ? { ...dressed, noon: true } : dressed;
}

/** Rules the weave moves that are in force on `day`: those read at another place than without it. */
export function wovenRules(content: Content, weave: WeaveDef, day: number): string[] {
  const plain = readOrder(content.rules, day);
  const moved = readOrder(wovenContent(content, weave).rules, day);
  return Object.keys(weave.order).filter((id) => plain.includes(id) && plain.indexOf(id) !== moved.indexOf(id));
}
