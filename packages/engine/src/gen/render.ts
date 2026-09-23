import type {
  Knobs,
  RavenTemplate,
  SpeechSlot,
  TallyTemplate,
  TestimonyTemplate,
  ToolId,
  Value,
} from '../content/types';
import type { DayCtx } from '../logic/context';
import { observe } from '../logic/judge';
import { eval2, type Truth } from '../logic/pred';
import type { Rng } from '../rng/rng';
import type { PlannedLie } from './lies';
import { weightedPick } from './pick';
import type { Evidence, Field, ForgeryTell, Lie, Look } from './types';

interface SpeechLine {
  readonly slot: SpeechSlot;
  readonly asserts?: { readonly fact: string; readonly value: Value };
  readonly lie?: number;
}

/** What the soul will say: every lie, plus some truthful lines chosen by the speech slots' chances. */
export function planSpeech(truth: Truth, lies: readonly PlannedLie[], ctx: DayCtx, rng: Rng): SpeechLine[] {
  const lines: SpeechLine[] = [];
  for (const slot of ctx.content.speech) {
    if (slot.since > ctx.day) continue;
    if (!slot.fact) {
      if (rng.chance(slot.chance, 100)) lines.push({ slot: slot.slot });
      continue;
    }
    // A fact the soul's forged tally lies about stays unspoken: the truth from its own mouth would look like the lie.
    if (lies.some((l) => l.fact === slot.fact && l.via === 'tally')) continue;
    const lie = lies.findIndex((l) => l.fact === slot.fact);
    if (lie >= 0) {
      lines.push({ slot: slot.slot, asserts: { fact: slot.fact, value: (lies[lie] as PlannedLie).claimed }, lie });
    } else if (rng.chance(slot.chance, 100) && ctx.facts.get(slot.fact)?.pinned === false) {
      lines.push({ slot: slot.slot, asserts: { fact: slot.fact, value: truth[slot.fact] as Value } });
    }
  }
  return lines;
}

export interface RavenPlan {
  readonly huginn: readonly { readonly fact: string; readonly value: Value }[];
  readonly muninn: 'identity' | 'forgot' | null;
}

/** Huginn reports some decisive facts (truthfully); Muninn names the soul or forgets. */
export function planRavens(truth: Truth, decisive: readonly string[], ctx: DayCtx, knobs: Knobs, rng: Rng): RavenPlan {
  const huginn: { fact: string; value: Value }[] = [];
  for (const fact of decisive) {
    if (huginn.length >= 2) break;
    const value = truth[fact] as Value;
    const hasLine = ctx.content.ravens.some(
      (t) => t.raven === 'huginn' && t.asserts?.fact === fact && t.asserts.value === value,
    );
    if (hasLine && rng.chance(knobs.ravenRate, 100)) huginn.push({ fact, value });
  }
  const muninn = rng.chance(knobs.forgetRate, 100) ? 'forgot' : rng.chance(1, 2) ? 'identity' : null;
  return { huginn, muninn };
}

/**
 * Fills template placeholders. Each pool is drawn once per soul, so every line
 * that mentions the place, foe or weapon agrees; a mismatch would look like a lie.
 */
function fillParams(
  params: Readonly<Record<string, string>> | undefined,
  look: Look,
  ctx: DayCtx,
  shared: Map<string, string>,
  rng: Rng,
): Record<string, string | number> {
  const out: Record<string, string | number> = { name: look.name, patronym: look.patronym, gender: look.gender };
  for (const [key, poolId] of Object.entries(params ?? {})) {
    let value = shared.get(poolId);
    if (value === undefined) {
      const pool = ctx.content.pools[poolId];
      value = pool && pool.length > 0 ? rng.pick(pool) : key;
      shared.set(poolId, value);
    }
    out[key] = value;
  }
  return out;
}

function pickTestimony(line: SpeechLine, persona: string, ctx: DayCtx, rng: Rng): TestimonyTemplate | null {
  const matches = ctx.content.testimony.filter(
    (t) =>
      t.slot === line.slot &&
      (t.personas === undefined || t.personas.includes(persona)) &&
      (line.asserts
        ? t.asserts?.fact === line.asserts.fact && t.asserts.value === line.asserts.value
        : t.asserts === undefined),
  );
  if (matches.length === 0) return null;
  return weightedPick(
    matches,
    matches.map((t) => t.weight),
    rng,
  );
}

function pickRaven(
  raven: 'huginn' | 'muninn',
  test: (t: RavenTemplate) => boolean,
  ctx: DayCtx,
  rng: Rng,
): RavenTemplate | null {
  const matches = ctx.content.ravens.filter((t) => t.raven === raven && test(t));
  if (matches.length === 0) return null;
  return weightedPick(
    matches,
    matches.map((t) => t.weight),
    rng,
  );
}

/** The tool that shows a forged tally's tell (the carving has to be read closely). */
export const TELL_TOOL: ToolId = 'runeLens';

export interface TallyPlan {
  /** What each carved line says, and the index of the lie it carries if it is forged. */
  readonly lines: readonly { readonly fact: string; readonly value: Value; readonly lie?: number }[];
  /** How a forged tally gives itself away; null for an honest one. */
  readonly tell: ForgeryTell | null;
}

const TELLS: readonly ForgeryTell[] = ['elderRune', 'mirroredRune', 'brokenFormula'];

const hasTallyLine = (ctx: DayCtx, fact: string, value: Value) =>
  (ctx.content.tallies ?? []).some((t) => t.asserts.fact === fact && t.asserts.value === value);

/**
 * The soul's saga tally, if it carries one (Day 11 on). A forger's tally
 * carves its lie, perhaps beside one true deed, and always shows a tell; an
 * honest tally (at the day's tallyRate) records up to two decisive facts.
 */
export function planTally(
  truth: Truth,
  lies: readonly PlannedLie[],
  decisive: readonly string[],
  ctx: DayCtx,
  knobs: Knobs,
  rng: Rng,
): TallyPlan | null {
  const truths = decisive
    .filter((f) => hasTallyLine(ctx, f, truth[f] as Value))
    .map((fact) => ({ fact, value: truth[fact] as Value }));
  const forged = lies.findIndex((l) => l.via === 'tally');
  if (forged >= 0) {
    const lie = lies[forged] as PlannedLie;
    const extra = truths.filter((t) => t.fact !== lie.fact).slice(0, rng.chance(1, 2) ? 1 : 0);
    return { lines: [{ fact: lie.fact, value: lie.claimed, lie: forged }, ...extra], tell: rng.pick(TELLS) };
  }
  if (!knobs.tallyRate || truths.length === 0 || !rng.chance(knobs.tallyRate, 100)) return null;
  return { lines: truths.slice(0, 2), tell: null };
}

function pickTally(fact: string, value: Value, ctx: DayCtx, rng: Rng): TallyTemplate | null {
  const matches = (ctx.content.tallies ?? []).filter((t) => t.asserts.fact === fact && t.asserts.value === value);
  if (matches.length === 0) return null;
  return weightedPick(
    matches,
    matches.map((t) => t.weight),
    rng,
  );
}

export interface RenderInput {
  readonly truth: Truth;
  readonly lies: readonly PlannedLie[];
  readonly speech: readonly SpeechLine[];
  readonly ravens: RavenPlan;
  readonly tally?: TallyPlan | null;
  /** Cue keys to show, and which of them are decoys. */
  readonly cues: readonly { readonly key: string; readonly decoy: boolean }[];
  readonly look: Look;
  readonly persona: string;
}

export interface Rendered {
  readonly evidence: Evidence;
  readonly lies: readonly Lie[];
  readonly decoys: readonly string[];
  /** Lies that had no template to be spoken with (the case gets rejected). */
  readonly unspoken: number;
}

/** Turns the truth and plans into the fields the player sees. */
export function render(input: RenderInput, ctx: DayCtx, rng: Rng): Rendered {
  const { truth, look, persona } = input;
  const fields: Field[] = [];
  const shared = new Map<string, string>();

  for (const obs of ctx.observations) {
    if (obs.when && !eval2(obs.when, truth, ctx)) continue;
    fields.push({
      id: obs.doc ? `${obs.doc}.${obs.key}` : obs.tool ? `tool.${obs.tool}.${obs.key}` : `body.${obs.view}.${obs.key}`,
      item: obs.doc ?? 'body',
      ...(obs.doc ? {} : { view: obs.view }),
      ...(obs.tool ? { tool: obs.tool } : {}),
      salience: obs.salience,
      cost: obs.cost,
      obs: { key: obs.key, value: observe(obs, truth, ctx) },
    });
  }

  const decoys: string[] = [];
  for (const c of input.cues) {
    const def = ctx.cues.find((d) => d.key === c.key);
    if (!def) continue;
    const id = `cue.${c.key}`;
    fields.push({ id, item: 'body', view: def.view, salience: def.salience, cost: 0, cue: { key: c.key } });
    if (c.decoy) decoys.push(id);
  }

  const lies: Lie[] = [];
  let unspoken = 0;
  let n = 0;
  for (const line of input.speech) {
    const tpl = pickTestimony(line, persona, ctx, rng);
    if (!tpl) {
      if (line.lie !== undefined) unspoken++;
      continue;
    }
    const id = `testimony.${n++}`;
    fields.push({
      id,
      item: 'testimony',
      salience: 3,
      cost: 2,
      ...(line.asserts ? { says: { fact: line.asserts.fact, value: line.asserts.value } } : {}),
      text: { msg: tpl.msg, params: fillParams(tpl.params, look, ctx, shared, rng) },
    });
    if (line.lie !== undefined) {
      const planned = input.lies[line.lie];
      if (planned) lies.push({ ...planned, field: id });
    }
  }

  let h = 0;
  for (const s of input.ravens.huginn) {
    const tpl = pickRaven('huginn', (t) => t.asserts?.fact === s.fact && t.asserts.value === s.value, ctx, rng);
    if (!tpl) continue;
    fields.push({
      id: `huginn.${h++}`,
      item: 'huginn',
      salience: 3,
      cost: 2,
      says: { fact: s.fact, value: s.value },
      text: { msg: tpl.msg, params: fillParams(tpl.params, look, ctx, shared, rng) },
    });
  }
  if (input.ravens.muninn) {
    const tag = input.ravens.muninn;
    const tpl = pickRaven('muninn', (t) => t.tag === tag, ctx, rng);
    if (tpl) {
      fields.push({
        id: 'muninn.0',
        item: 'muninn',
        salience: 3,
        cost: 2,
        text: { msg: tpl.msg, params: fillParams(tpl.params, look, ctx, shared, rng) },
      });
    }
  }

  // The saga tally last, on its own stream, so souls without one render exactly as before.
  if (input.tally) {
    const tallyRng = rng.fork('tally');
    input.tally.lines.forEach((line, i) => {
      const tpl = pickTally(line.fact, line.value, ctx, tallyRng);
      if (!tpl) {
        if (line.lie !== undefined) unspoken++;
        return;
      }
      const id = `tally.${i}`;
      fields.push({
        id,
        item: 'tally',
        salience: 3,
        cost: 2,
        says: { fact: line.fact, value: line.value },
        text: { msg: tpl.msg, params: fillParams(tpl.params, look, ctx, shared, tallyRng) },
      });
      const planned = line.lie === undefined ? undefined : input.lies[line.lie];
      if (planned) lies.push({ ...planned, field: id });
    });
    if (input.tally.tell) {
      fields.push({
        id: 'tally.tell',
        item: 'tally',
        tool: TELL_TOOL,
        salience: 2,
        cost: 1,
        tell: input.tally.tell,
        text: { msg: `tell.${input.tally.tell}`, params: {} },
      });
    }
  }

  return { evidence: { fields, look, persona }, lies, decoys, unspoken };
}
