import type { Content, QuestionKind, QuestionTemplate, Value } from '../content/types';
import { weightedPick } from '../gen/pick';
import type { CaseSpec } from '../gen/types';
import { Rng } from '../rng/rng';

export interface QuestionResponse {
  readonly kind: QuestionKind;
  readonly template: string;
  readonly lines: readonly { readonly msg: string; readonly params: Readonly<Record<string, string | number>> }[];
  /** What the answer establishes (a confession reveals the truth). */
  readonly reveals: readonly { readonly fact: string; readonly value: Value }[];
}

function specificity(t: QuestionTemplate): number {
  return (
    (t.on.fact === '*' ? 0 : 1) +
    (t.on.claimed === undefined ? 0 : 1) +
    (t.on.truth === undefined ? 0 : 1) +
    (t.on.persona === undefined ? 0 : 1)
  );
}

/**
 * How a soul answers when questioned about a contradiction on `lieField`.
 * Deterministic per case; avoids the last 20 templates used (`recent`).
 */
export function questionResponse(
  c: CaseSpec,
  lieField: string,
  content: Content,
  recent: readonly string[] = [],
): QuestionResponse | null {
  const lie = c.lies.find((l) => l.field === lieField);
  if (!lie) return null;
  const persona = c.evidence.persona;
  const matches = content.questions.filter(
    (t) =>
      t.on.kind === lie.onQuestion &&
      (t.on.fact === '*' || t.on.fact === lie.fact) &&
      (t.on.claimed === undefined || t.on.claimed === lie.claimed) &&
      (t.on.truth === undefined || t.on.truth.includes(lie.truth)) &&
      (t.on.persona === undefined || t.on.persona.includes(persona)),
  );
  if (matches.length === 0) return null;
  const best = Math.max(...matches.map(specificity));
  const top = matches.filter((t) => specificity(t) === best);
  const fresh = top.filter((t) => !recent.includes(t.id));
  const pool = fresh.length > 0 ? fresh : top;
  const rng = new Rng(`${c.meta.seed}|q|${lieField}`);
  const tpl = weightedPick(
    pool,
    pool.map((t) => t.weight),
    rng,
  );
  const params = {
    name: c.evidence.look.name,
    patronym: c.evidence.look.patronym,
    gender: c.evidence.look.gender,
    truth: String(lie.truth),
  };
  return {
    kind: lie.onQuestion,
    template: tpl.id,
    lines: tpl.msgs.map((msg) => ({ msg, params })),
    reveals: lie.onQuestion === 'confess' ? [{ fact: lie.fact, value: lie.truth }] : [],
  };
}
