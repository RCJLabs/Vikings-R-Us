import type {
  CampaignDef,
  Content,
  Destination,
  Economy,
  Effect,
  EndingDef,
  Faction,
  FavourDef,
  SliceDef,
  StatePred,
  UpgradeDef,
} from '../content/types';
import { FACTIONS } from '../content/types';
import { dressForDay, generateDay } from '../gen/generate';
import { scriptedCase } from '../gen/scripted';
import type { CaseSpec } from '../gen/types';
import { createDayContext, type DayCtx } from '../logic/context';
import { eval2 } from '../logic/pred';
import { Rng } from '../rng/rng';
import {
  type Assists,
  type ShiftAction,
  type ShiftEvent,
  type ShiftMods,
  type ShiftState,
  startShift,
  stepShift,
  type Verdict,
} from '../shift/shift';
import {
  type Appeal,
  type AppealHeard,
  type Bills,
  type DayLedger,
  type DayMistake,
  type DayRequest,
  type DayWaiting,
  evalState,
  type FamilyMember,
  type LineSoul,
  type RequestSettled,
  type RunState,
  stateValue,
} from './state';

/*
 * The campaign's day loop (docs/tech-spec.md §4):
 *   morning -> beginShift -> shift -> audit -> endAudit -> night -> endNight -> next morning
 * Scenes (morning and night) arrive as `scene` actions carrying their effects,
 * which the story layer computes from the player's choices.
 */

export type RunAction =
  | {
      readonly t: 'beginShift';
      readonly at: number;
      /** The assists the player has on as the shift begins (they're kept with the day's shift). */
      readonly assists?: Assists;
    }
  | { readonly t: 'shift'; readonly action: ShiftAction }
  | { readonly t: 'endAudit' }
  | { readonly t: 'bills'; readonly bills: Bills }
  | { readonly t: 'buy'; readonly item: string }
  | {
      readonly t: 'scene';
      readonly id: string;
      /** The choices made, for replays and reports; the engine applies only `effects`. */
      readonly choices?: readonly number[];
      readonly effects: readonly Effect[];
    }
  | { readonly t: 'endNight' }
  /**
   * The morning's appeal heard: the soul stamped again at the desk, on the rules of the day it was judged
   * (docs/tech-spec.md §40), or null to let the verdict stand.
   */
  | { readonly t: 'appeal'; readonly stamped: Destination | null };

export type RunEvent =
  | { readonly e: 'shift'; readonly event: ShiftEvent }
  | { readonly e: 'audited'; readonly ledger: DayLedger }
  | { readonly e: 'bought'; readonly item: string }
  | { readonly e: 'scene'; readonly id: string; readonly effects: readonly Effect[] }
  | { readonly e: 'family'; readonly id: string; readonly change: 'sick' | 'well' | 'died' | 'left' }
  | { readonly e: 'draupnir'; readonly rings: number }
  | { readonly e: 'dayBegins'; readonly day: number }
  | { readonly e: 'ended'; readonly ending: string }
  | { readonly e: 'appealed'; readonly heard: AppealHeard }
  | { readonly e: 'rejected'; readonly reason: string };

export interface RunEnv {
  readonly content: Content;
  /** The day context for `run.day` (callers cache it; `runContext` builds one). */
  readonly ctx: DayCtx;
  /** A queue saved earlier for this day, used instead of generating one (see startShift). */
  readonly queue?: readonly CaseSpec[];
}

const zeroStanding = (): Record<Faction, number> =>
  Object.fromEntries(FACTIONS.map((f) => [f, 0])) as Record<Faction, number>;

export function campaignOf(content: Content): CampaignDef {
  if (!content.campaign) throw new Error('This build has no campaign');
  return content.campaign;
}

export interface NewRunOptions {
  /** Story Mode: no sun and no fines. */
  readonly story?: boolean;
  /** The vertical slice: its first days, then the jump to its late day ('fromJump' starts on that day). */
  readonly slice?: 'play' | 'fromJump';
}

export function newRun(content: Content, seed: string, opts: NewRunOptions = {}): RunState {
  const campaign = campaignOf(content);
  if (opts.slice && !campaign.slice) throw new Error('This build has no vertical slice');
  const run = firstMorning(campaign, seed, content.genVersion, opts);
  return opts.slice === 'fromJump' && campaign.slice ? jump(run, campaign.slice) : run;
}

function firstMorning(campaign: CampaignDef, seed: string, genVersion: number, opts: NewRunOptions): RunState {
  return {
    v: 1,
    seed,
    genVersion,
    day: 1,
    phase: 'morning',
    shift: null,
    rings: campaign.startRings,
    debtNights: 0,
    standing: zeroStanding(),
    einherjar: { worthy: 0, unworthy: 0 },
    family: campaign.family.map((f) => ({ id: f.id, status: 'well', cold: 0, hungry: 0, sickNights: 0 })),
    upgrades: [],
    flags: {},
    ledger: [],
    scenes: [],
    storyRings: 0,
    bills: null,
    spent: 0,
    ending: null,
    story: opts.story === true,
    ...(opts.slice ? { slice: true } : {}),
  };
}

/**
 * The day after `run.day`: the next one, or in a vertical slice the jump over
 * the unwritten middle.
 */
function nextMorning(run: RunState, campaign: CampaignDef): RunState {
  const slice = run.slice ? campaign.slice : undefined;
  if (!slice || run.day !== slice.after) return { ...run, day: run.day + 1 };
  return jump(run, slice);
}

/** The slice's late day, with what the skipped days would have brought (the run's own flags win). */
function jump(run: RunState, slice: SliceDef): RunState {
  const standing = { ...run.standing };
  const story = { ...run.storyStanding };
  for (const [f, by] of Object.entries(slice.preset.standing ?? {})) {
    standing[f as Faction] = (standing[f as Faction] ?? 0) + (by ?? 0);
    story[f as Faction] = (story[f as Faction] ?? 0) + (by ?? 0);
  }
  return {
    ...run,
    day: slice.day,
    rings: run.rings + (slice.preset.rings ?? 0),
    standing,
    storyStanding: story,
    flags: { ...slice.preset.flags, ...run.flags },
  };
}

/**
 * The string key a power goes by on `day`: its own name, or the alias it wears before the story
 * names it (the stranger is Loki, but nobody says so until Day 12).
 */
export function factionKey(content: Content, faction: Faction, day: number): string {
  const alias = content.campaign?.aliases?.find((a) => a.faction === faction && day < a.untilDay);
  return alias?.name ?? `faction.${faction}`;
}

/** The upgrades' combined effect on today's shift. */
export function shiftMods(run: RunState, content: Content): ShiftMods {
  const owned = campaignOf(content).shop.filter((u) => run.upgrades.includes(u.id));
  const toolCostS: Record<string, number> = {};
  let questionS: number | undefined;
  let sunS = 0;
  for (const u of owned) {
    const e = u.effect;
    if ('tool' in e) toolCostS[e.tool] = Math.min(toolCostS[e.tool] ?? e.costS, e.costS);
    else if ('questionS' in e) questionS = Math.min(questionS ?? e.questionS, e.questionS);
    else sunS += e.sunS;
  }
  // The gods' favours for the day (docs/tech-spec.md §43); a sick member's extra night is the night's, not the shift's.
  let freeQuestions = 0;
  let finePct: number | undefined;
  for (const f of favoursFor(run, content)) {
    const e = f.effect;
    if ('sunS' in e) sunS += e.sunS;
    else if ('freeQuestions' in e) freeQuestions += e.freeQuestions;
    else if ('finePct' in e) finePct = Math.min(finePct ?? e.finePct, e.finePct);
  }
  return {
    ...(Object.keys(toolCostS).length > 0 ? { toolCostS } : {}),
    ...(questionS !== undefined ? { questionS } : {}),
    ...(sunS > 0 ? { sunS } : {}),
    ...(freeQuestions > 0 ? { freeQuestions } : {}),
    ...(finePct !== undefined ? { finePct } : {}),
  };
}

/**
 * The gods' favours (docs/tech-spec.md §43) that the run's standing earns now: each god whose standing is at a
 * favour's mark. The gate grants them for the day and its night, so the morning's standing decides the day's.
 */
export function favoursFor(run: RunState, content: Content): FavourDef[] {
  return (campaignOf(content).favours ?? []).filter((f) => run.standing[f.faction] >= f.at);
}

/**
 * Family care tonight: the campaign's, and the nights more that a god's favour gives the sick. The favours are
 * the day's, as its audit filed them; before then, those the gate will grant.
 */
export function careFor(run: RunState, content: Content): CampaignDef['care'] {
  const campaign = campaignOf(content);
  const today = run.ledger[run.ledger.length - 1];
  const ids = today?.day === run.day ? (today.favours ?? []) : favoursFor(run, content).map((f) => f.id);
  const extra = (campaign.favours ?? [])
    .filter((f) => ids.includes(f.id))
    .reduce((n, f) => n + ('sickNights' in f.effect ? f.effect.sickNights : 0), 0);
  return extra > 0 ? { ...campaign.care, sickNights: campaign.care.sickNights + extra } : campaign.care;
}

/** The upgrades on sale tonight. */
export function shopFor(run: RunState, content: Content): UpgradeDef[] {
  return campaignOf(content).shop.filter((u) => u.since <= run.day && !run.upgrades.includes(u.id));
}

export function economyOf(env: RunEnv): Economy {
  const e = env.ctx.spec.economy;
  if (!e) throw new Error(`Day ${env.ctx.day} has no economy`);
  return e;
}

/** What tonight's bills cost as set. */
export function billTotal(
  run: RunState,
  economy: Economy,
  bills: Bills,
): { hearth: number; food: number; medicine: number } {
  const home = run.family.filter((m) => m.status !== 'gone');
  const sick = new Set(home.filter((m) => m.status === 'sick').map((m) => m.id));
  return {
    hearth: bills.hearth ? economy.costs.hearth : 0,
    food: bills.food ? economy.costs.food * home.length : 0,
    medicine: economy.costs.medicine * bills.medicine.filter((id) => sick.has(id)).length,
  };
}

/** Bills default to paying for everything, as a careful player would. */
export function defaultBills(run: RunState): Bills {
  return { hearth: true, food: true, medicine: run.family.filter((m) => m.status === 'sick').map((m) => m.id) };
}

const matches = (want: Destination | '*', got: Destination) => want === '*' || want === got;

/** What sending a soul that belonged in `expected` to `stamped` does to standing: nothing when it's right. */
export function standingFx(
  campaign: CampaignDef,
  expected: Destination,
  stamped: Destination,
): Partial<Record<Faction, number>> {
  if (stamped === expected) return {};
  const rule = campaign.standing.find((r) => matches(r.expected, expected) && matches(r.stamped, stamped));
  return { ...rule?.fx };
}

/** Destinations a soul judged rightly might still argue with. */
const GRUDGES: ReadonlySet<Destination> = new Set(['HEL', 'RAN', 'TRANSFER']);

/**
 * The soul, if any, that asks tomorrow morning to be judged again (docs/tech-spec.md §40): most likely one of
 * today's souls sent to the wrong place; sometimes one judged rightly into a hall it resents, trying its luck.
 * Story souls have their own consequences and never appeal. Drawn from its own stream of the run's seed, so
 * the same run always brings the same appeals.
 */
function chooseAppeal(
  run: RunState,
  shift: ShiftState,
  campaign: CampaignDef,
  costs: ReadonlyMap<number, { fine: number; standing: Partial<Record<Faction, number>>; worthy: boolean }>,
  fined: boolean,
  given: (v: Verdict) => boolean,
): Appeal | undefined {
  const def = campaign.appeals;
  if (!def || run.day < def.from || run.day >= campaign.lastDay) return undefined;
  const story = (v: Verdict) => shift.cases[v.index]?.script !== undefined;
  const judged = shift.verdicts.filter((v) => v.stamped !== null && !story(v));
  const wronged = judged.filter((v) => v.stamped !== v.expected && !given(v));
  const chancers = judged.filter((v) => v.correct && GRUDGES.has(v.expected));
  if (wronged.length + chancers.length === 0) return undefined;
  const rng = new Rng(`${run.seed}|appeal|${run.day}`);
  if (!rng.chance(wronged.length > 0 ? def.afterMistake : def.otherwise, 100)) return undefined;
  const pool =
    wronged.length === 0
      ? chancers
      : chancers.length === 0
        ? wronged
        : rng.chance(def.chancers, 100)
          ? chancers
          : wronged;
  const v = pool[rng.int(0, pool.length - 1)];
  const c = v ? shift.cases[v.index] : undefined;
  if (!v || !c || v.stamped === null) return undefined;
  const cost = costs.get(v.index);
  return {
    day: run.day,
    case: c,
    stamped: v.stamped,
    worthy: cost?.worthy ?? false,
    fined,
    fine: cost?.fine ?? 0,
    standing: cost?.standing ?? {},
  };
}

/** Moves a soul from one hall to another in the run's counts (Ragnarök's host is made of them). */
function moveSoul(run: RunState, appeal: Appeal, to: Destination): Pick<RunState, 'sent' | 'einherjar'> {
  const sent: Partial<Record<Destination, number>> = { ...run.sent };
  sent[appeal.stamped] = Math.max(0, (sent[appeal.stamped] ?? 0) - 1);
  sent[to] = (sent[to] ?? 0) + 1;
  const einherjar = { ...run.einherjar };
  const kind = appeal.worthy ? 'worthy' : 'unworthy';
  if (appeal.stamped === 'VALHALLA') einherjar[kind] = Math.max(0, einherjar[kind] - 1);
  if (to === 'VALHALLA') einherjar[kind] += 1;
  return { sent, einherjar };
}

/**
 * The appeal decided (docs/tech-spec.md §40). Righted: its fine comes back and the standing it moved is
 * undone. Upheld with good reason: a small bonus. Decided wrongly: a fine, and the gods mind where the soul
 * went. Left to stand: nothing changes. The soul goes wherever it was last stamped.
 */
function hearAppeal(run: RunState, appeal: Appeal, stamped: Destination | null, campaign: CampaignDef): RunState {
  const def = campaign.appeals;
  const c = appeal.case;
  const expected = c.expect.dest;
  const base = {
    day: appeal.day,
    name: c.evidence.look.name,
    from: appeal.stamped,
    to: stamped,
    expected,
    rule: c.expect.rule,
  };
  if (stamped === null || !def) {
    const heard: AppealHeard = { ...base, to: null, outcome: 'letStand', rings: 0, standing: {} };
    const { appeal: _, ...rest } = run;
    return { ...rest, appealHeard: heard };
  }
  const wasRight = appeal.stamped === expected;
  const nowRight = stamped === expected;
  const outcome: AppealHeard['outcome'] = nowRight ? (wasRight ? 'upheld' : 'righted') : 'wrong';
  const rings = outcome === 'righted' ? appeal.fine : outcome === 'upheld' ? def.bonus : appeal.fined ? -def.fine : 0;
  // What the verdict moved goes, and what the new one moves comes: righting a mistake undoes it exactly.
  const standing: Partial<Record<Faction, number>> = {};
  const add = (fx: Partial<Record<Faction, number>>, sign: number) => {
    for (const [f, n] of Object.entries(fx)) {
      const next = (standing[f as Faction] ?? 0) + sign * (n ?? 0);
      if (next === 0) delete standing[f as Faction];
      else standing[f as Faction] = next;
    }
  };
  add(appeal.standing, -1);
  add(standingFx(campaign, expected, stamped), 1);
  const nextStanding = { ...run.standing };
  for (const [f, n] of Object.entries(standing)) nextStanding[f as Faction] += n ?? 0;
  const moved = stamped === appeal.stamped ? {} : moveSoul(run, appeal, stamped);
  const heard: AppealHeard = { ...base, outcome, rings, standing };
  const { appeal: _, ...rest } = run;
  return { ...rest, ...moved, rings: run.rings + rings, standing: nextStanding, appealHeard: heard };
}

/**
 * A day's own souls, with those who waited through the night (docs/tech-spec.md §41) placed first, after the
 * day's teaching soul, each in the place of one of the day's: one who shares its name if there is one, so no
 * two in the line do, else the last. The line is no longer for them.
 */
function lineFor(seed: string, ctx: DayCtx, waiting: readonly CaseSpec[]): CaseSpec[] {
  const cases = generateDay(seed, ctx).cases.slice();
  const teach = ctx.spec.queue.teachFirst;
  const front = teach !== undefined && cases[0]?.archetype === teach ? 1 : 0;
  for (const w of waiting) {
    const same = cases.findIndex((c, i) => i >= front && c.evidence.look.name === w.evidence.look.name);
    const drop = same >= 0 ? same : cases.length - 1;
    if (drop >= front) cases.splice(drop, 1);
  }
  cases.splice(front, 0, ...waiting);
  return cases;
}

/**
 * Today's queue: the day's line (its own souls and any who waited through the
 * night), with the day's story souls placed among them. Generated souls are the
 * same with or without the story souls, which only appear when their `when`
 * holds as the shift begins.
 */
export function campaignQueue(run: RunState, env: RunEnv): CaseSpec[] {
  const cases = lineFor(run.seed, env.ctx, run.waiting ?? []);
  const slots = [...(env.ctx.spec.queue.scripted ?? [])].sort((a, b) => a.at - b.at);
  for (const slot of slots) {
    const def = env.content.scripted?.find((d) => d.id === slot.case);
    if (!def || (def.when && !evalState(def.when, run))) continue;
    // The compiler proves shipped story souls can be made; if one can't, the day goes on without it.
    const made = scriptedCase(def, env.ctx, run.seed, slot.at);
    if (made.ok) cases.splice(Math.min(slot.at, cases.length), 0, made.case);
  }
  return cases;
}

/** The story threads still in play for the journal: each text key, with `{n}` when it counts something. */
export function threadsInPlay(run: RunState, content: Content): { id: string; text: string; n?: number }[] {
  return (content.campaign?.threads ?? [])
    .filter((th) => evalState(th.when, run))
    .map((th) => ({ id: th.id, text: th.text, ...(th.count ? { n: stateValue(run, th.count) } : {}) }));
}

/** What stamping a story soul `stamped` does to the story (nothing for a generated soul). */
export function stampEffects(content: Content, c: CaseSpec, stamped: Destination): Effect[] {
  if (!c.script) return [];
  const def = content.scripted?.find((d) => d.id === c.script);
  return (def?.onStamp ?? []).filter((rule) => matches(rule.stamped, stamped)).flatMap((rule) => rule.effects);
}

/** The story consequences of how today's story souls were stamped. */
function storyEffects(shift: ShiftState, content: Content): Effect[] {
  const out: Effect[] = [];
  for (const v of shift.verdicts) {
    const c = shift.cases[v.index];
    if (c && v.stamped !== null) out.push(...stampEffects(content, c, v.stamped));
  }
  return out;
}

/**
 * The line at dusk (docs/tech-spec.md §41): the souls still waiting when the sun set. Those who can wait come
 * back first the next day, seen afresh under its rules; the living can't, and die in the night. Only when the
 * next day follows on (not across a slice's jump, nor after the last day), and never story souls, whose
 * stories go on without them.
 */
function waitingLine(
  run: RunState,
  shift: ShiftState,
  env: RunEnv,
): { waiting: DayWaiting; carried: CaseSpec[] } | null {
  const campaign = campaignOf(env.content);
  const def = campaign.waiting;
  if (!def || run.day < def.from || dayAfter(run, campaign, run.day) !== run.day + 1) return null;
  const left = shift.verdicts.flatMap((v) => {
    const c = shift.cases[v.index];
    return v.stamped === null && c && c.script === undefined ? [c] : [];
  });
  if (left.length === 0) return null;
  const tomorrow = createDayContext(env.content, run.day + 1, run.seed);
  const soul = (c: CaseSpec): LineSoul => ({ id: c.id, name: `${c.evidence.look.name} ${c.evidence.look.patronym}` });
  const carried: CaseSpec[] = [];
  const died: LineSoul[] = [];
  const gone: LineSoul[] = [];
  for (const c of left) {
    if (c.expect.dest === 'RETURN') {
      died.push(soul(c));
      continue;
    }
    const dressed = dressForDay(c, tomorrow);
    if (dressed) carried.push(dressed);
    else gone.push(soul(c));
  }
  const standing: Partial<Record<Faction, number>> = {};
  const add = (fx: Readonly<Partial<Record<Faction, number>>>) => {
    for (const [f, n] of Object.entries(fx)) standing[f as Faction] = (standing[f as Faction] ?? 0) + (n ?? 0);
  };
  if (left.length >= def.crowd) add(def.night);
  for (const _ of died) add(def.died);
  return {
    waiting: { carried: carried.map(soul), died, ...(gone.length > 0 ? { gone } : {}), standing },
    carried,
  };
}

/**
 * The next morning's requests (docs/tech-spec.md §42), from their own stream of the run's seed: on some
 * mornings from `from` on, a god asks for souls that belong to another, of a kind the next day's line holds
 * enough of; now and then a second god asks for the same souls. `waiting` are the souls who'll be in that
 * line from tonight's.
 */
function drawRequests(run: RunState, env: RunEnv, waiting: readonly CaseSpec[]): DayRequest[] {
  const campaign = campaignOf(env.content);
  const def = campaign.requests;
  const day = dayAfter(run, campaign, run.day);
  if (!def || day === null || day < def.from) return [];
  const rng = new Rng(`${run.seed}|requests|${day}`);
  if (!rng.chance(def.chance, 100)) return [];
  const ctx = createDayContext(env.content, day, run.seed);
  const line = lineFor(run.seed, ctx, waiting);
  const held = (dest: Destination) => line.filter((c) => c.expect.dest === dest).length;
  const open = def.list.filter(
    (r) =>
      r.since <= day &&
      (r.until === undefined || day < r.until) &&
      ctx.destinations.has(r.from) &&
      ctx.destinations.has(r.to) &&
      held(r.from) >= r.n,
  );
  if (open.length === 0) return [];
  const first = open[rng.int(0, open.length - 1)];
  if (!first) return [];
  const rivals = open.filter((r) => r.god !== first.god && r.from === first.from);
  const rival = rivals.length > 0 && rng.chance(def.rivals, 100) ? rivals[rng.int(0, rivals.length - 1)] : undefined;
  return [first, ...(rival ? [rival] : [])].map(({ since: _, until: __, ...r }) => r);
}

/** How today's requests went: the souls sent as asked, and each reward for one done in full. */
function settleRequests(run: RunState, shift: ShiftState): RequestSettled[] {
  return (run.requests ?? []).map((r) => {
    const done = shift.verdicts.filter((v) => v.expected === r.from && v.stamped === r.to).length;
    const met = done >= r.n;
    return { id: r.id, god: r.god, from: r.from, to: r.to, n: r.n, done, met, standing: met ? { ...r.reward } : {} };
  });
}

/** Pay, fines, standing and einherjar for a finished shift. */
function audit(
  run: RunState,
  shift: ShiftState,
  env: RunEnv,
): { run: RunState; ledger: DayLedger; flags: Record<string, number> } {
  const campaign = campaignOf(env.content);
  const economy = economyOf(env);
  let correct = 0;
  let wrong = 0;
  let unjudged = 0;
  let pay = 0;
  let bonus = 0;
  let fines = 0;
  const standing: Partial<Record<Faction, number>> = {};
  const einherjar = { ...run.einherjar };
  const sent: Partial<Record<Destination, number>> = { ...run.sent };
  let naglfar = run.naglfar ?? 0;
  const flags: Record<string, number> = { ...run.flags };
  const assists = shift.config.assists;
  const fined = !run.story && !assists?.noFines;
  // A god's favour can lighten each fine (docs/tech-spec.md §43).
  const finePct = shift.config.mods?.finePct ?? 100;
  const mistakes: DayMistake[] = [];
  // What each verdict cost, for an appeal to give back.
  const costs = new Map<number, { fine: number; standing: Partial<Record<Faction, number>>; worthy: boolean }>();
  shift.verdicts.forEach((v: Verdict) => {
    const c = shift.cases[v.index];
    if (v.stamped === null) {
      unjudged++;
      return;
    }
    const finesBefore = fines;
    if (v.correct) {
      correct++;
      pay += economy.wage;
      if (v.caught > 0) bonus += economy.docBonus;
    } else {
      wrong++;
      mistakes.push({
        rule: v.rule,
        expected: v.expected,
        stamped: v.stamped,
        ...(v.skipped && v.skipped.length > 0 ? { skipped: v.skipped } : {}),
      });
      if (fined && wrong > economy.warnings) {
        const i = Math.min(wrong - economy.warnings - 1, economy.fines.length - 1);
        fines += Math.floor(((economy.fines[i] ?? 0) * finePct) / 100);
      }
    }
    // Only mistakes move standing: a god isn't angered (or flattered) by a soul sent where it belongs.
    const rule = v.correct
      ? undefined
      : campaign.standing.find((r) => matches(r.expected, v.expected) && matches(r.stamped, v.stamped as Destination));
    for (const [f, n] of Object.entries(rule?.fx ?? {}))
      standing[f as Faction] = (standing[f as Faction] ?? 0) + (n ?? 0);
    const worthy = c ? eval2({ ref: campaign.worthy }, c.truth, env.ctx) : false;
    if (v.stamped === 'VALHALLA' && c) {
      if (worthy) einherjar.worthy++;
      else einherjar.unworthy++;
    }
    costs.set(v.index, { fine: fines - finesBefore, standing: { ...rule?.fx }, worthy });
    sent[v.stamped] = (sent[v.stamped] ?? 0) + 1;
    // Every soul sent on with a procedure skipped (so far only nails left uncut) builds Naglfar.
    naglfar += v.skipped?.length ?? 0;
  });
  // The souls still in line at dusk: tomorrow's first, or (the living) lost in the night.
  const line = waitingLine(run, shift, env);
  // Today's requests settled; tomorrow's come with the morning.
  const requests = settleRequests(run, shift);
  // The favours the gate granted (standing hasn't moved since it opened), for the night and the records.
  const favours = favoursFor(run, env.content).map((f) => f.id);
  const ledger: DayLedger = {
    day: run.day,
    correct,
    wrong,
    unjudged,
    pay,
    bonus,
    fines,
    standing,
    ...(assists ? { assists } : {}),
    ...(mistakes.length > 0 ? { mistakes } : {}),
    ...(run.appealHeard ? { appeal: run.appealHeard } : {}),
    ...(line ? { waiting: line.waiting } : {}),
    ...(requests.length > 0 ? { requests } : {}),
    ...(favours.length > 0 ? { favours } : {}),
  };
  const nextStanding = { ...run.standing };
  for (const [f, n] of Object.entries(standing)) nextStanding[f as Faction] += n ?? 0;
  for (const [f, n] of Object.entries(line?.waiting.standing ?? {})) nextStanding[f as Faction] += n ?? 0;
  for (const r of requests) for (const [f, n] of Object.entries(r.standing)) nextStanding[f as Faction] += n ?? 0;
  // A soul given to a god whose request was done in full is that god's now, and doesn't appeal: righting it would
  // keep the reward without its cost.
  const given = (v: Verdict) => requests.some((r) => r.met && v.expected === r.from && v.stamped === r.to);
  const appeal = chooseAppeal(run, shift, campaign, costs, fined, given);
  const asked = drawRequests(run, env, line?.carried ?? []);
  const { appealHeard: _, appeal: __, waiting: ___, requests: ____, ...rest } = run;
  return {
    run: {
      ...rest,
      rings: run.rings + pay + bonus - fines,
      standing: nextStanding,
      einherjar,
      sent,
      naglfar,
      ledger: [...run.ledger, ledger],
      ...(appeal ? { appeal } : {}),
      ...(line && line.carried.length > 0 ? { waiting: line.carried } : {}),
      ...(asked.length > 0 ? { requests: asked } : {}),
    },
    ledger,
    flags,
  };
}

function applyEffects(run: RunState, effects: readonly Effect[], events: RunEvent[]): RunState {
  let r = run;
  for (const e of effects) {
    if ('rings' in e) r = { ...r, rings: r.rings + e.rings, storyRings: r.storyRings + e.rings };
    else if ('standing' in e) {
      r = {
        ...r,
        standing: { ...r.standing, [e.standing]: r.standing[e.standing] + e.by },
        storyStanding: { ...r.storyStanding, [e.standing]: (r.storyStanding?.[e.standing] ?? 0) + e.by },
      };
    } else if ('flag' in e) {
      const now = r.flags[e.flag] ?? 0;
      r = { ...r, flags: { ...r.flags, [e.flag]: e.set ?? now + (e.inc ?? 1) } };
    } else if ('family' in e) {
      const m = r.family.find((x) => x.id === e.family);
      if (!m || m.status === 'gone' || m.status === e.becomes) continue;
      r = {
        ...r,
        family: r.family.map((x) => (x.id === e.family ? { ...x, status: e.becomes, sickNights: 0 } : x)),
      };
      events.push({ e: 'family', id: e.family, change: e.becomes });
    }
  }
  return r;
}

/**
 * How tonight goes for one member under `bills`, leaving out only the chance of falling sick: their
 * state by morning if chance spares them, the change that is certain, and that chance in percent.
 */
export interface MemberNight {
  readonly member: FamilyMember;
  readonly change?: 'well' | 'sick' | 'died' | 'left';
  /** What makes falling sick certain: the cold, or hunger (the cold when both would). */
  readonly cause?: 'cold' | 'hungry';
  /** Percent chance of falling sick tonight (0 when it's certain, or can't happen). */
  readonly risk: number;
}

function memberNight(m: FamilyMember, bills: Bills, care: CampaignDef['care'], adult: boolean): MemberNight {
  if (m.status === 'gone') return { member: m, risk: 0 };
  const cold = bills.hearth ? 0 : m.cold + 1;
  const hungry = bills.food ? 0 : m.hungry + 1;
  if (m.status === 'sick') {
    if (bills.medicine.includes(m.id)) {
      return { member: { ...m, status: 'well', cold, hungry, sickNights: 0 }, change: 'well', risk: 0 };
    }
    const sickNights = m.sickNights + 1;
    if (sickNights >= care.sickNights) {
      const gone = adult ? 'died' : 'left';
      return { member: { ...m, status: 'gone', gone, cold, hungry, sickNights }, change: gone, risk: 0 };
    }
    return { member: { ...m, cold, hungry, sickNights }, risk: 0 };
  }
  if (cold >= care.needNights || hungry >= care.needNights) {
    const cause = cold >= care.needNights ? 'cold' : 'hungry';
    return { member: { ...m, status: 'sick', cold, hungry, sickNights: 0 }, change: 'sick', cause, risk: 0 };
  }
  const unmet = (bills.hearth ? 0 : 1) + (bills.food ? 0 : 1);
  return { member: { ...m, cold, hungry }, risk: Math.min(100, unmet * care.sickChance) };
}

/** Tonight's upkeep under `bills`, all but chance: the bills, Draupnir, the purse and debt by morning, each member's night. */
function upkeep(run: RunState, env: RunEnv, bills: Bills) {
  const campaign = campaignOf(env.content);
  const cost = billTotal(run, economyOf(env), bills);
  const draupnir = campaign.draupnir.nights.includes(run.day) ? campaign.draupnir.rings : 0;
  const rings = run.rings - cost.hearth - cost.food - cost.medicine + draupnir;
  const adults = new Map(campaign.family.map((f) => [f.id, f.adult]));
  return {
    cost,
    draupnir,
    rings,
    debtNights: rings < campaign.debtFloor ? run.debtNights + 1 : 0,
    members: run.family.map((m) => memberNight(m, bills, careFor(run, env.content), adults.get(m.id) === true)),
  };
}

/** What sleeping now would bring, all but chance, for the night screen to plan with (docs/tech-spec.md §23). */
export interface NightOutlook {
  readonly cost: { readonly hearth: number; readonly food: number; readonly medicine: number };
  /** Draupnir's rings tonight (0 on other nights). */
  readonly draupnir: number;
  /** The purse by morning. */
  readonly rings: number;
  /** Nights in a row below the debt floor by morning (0 when tonight ends above it). */
  readonly debtNights: number;
  readonly members: readonly MemberNight[];
  /** The ending tonight's upkeep would bring about (the debt, or no one left at home), if it would. */
  readonly ends: { readonly ending: string; readonly why: 'debt' | 'home' } | null;
}

/**
 * Tonight under `bills` (as set, by default): the same reckoning as the night itself, which
 * leaves only who falls sick by chance unknown. No ending the upkeep brings about depends on that.
 */
export function nightOutlook(run: RunState, env: RunEnv, bills: Bills = run.bills ?? defaultBills(run)): NightOutlook {
  const u = upkeep(run, env, bills);
  const projected: RunState = {
    ...run,
    family: u.members.map((n) => n.member),
    rings: u.rings,
    debtNights: u.debtNights,
  };
  const ending = endingFor(projected, env.content);
  const debt = new Set(
    stateMarks(env.content, 'debtNights').flatMap((m) => (m.atLeast !== undefined ? [m.ending] : [])),
  );
  const home = new Set(
    stateMarks(env.content, 'family.home').flatMap((m) => (m.atMost !== undefined ? [m.ending] : [])),
  );
  const why = ending && debt.has(ending) ? 'debt' : ending && home.has(ending) ? 'home' : null;
  return { ...u, ends: ending && why ? { ending, why } : null };
}

/** The run as `effects` would leave it (a scene's option, say), for previews: rings, standing, flags and family. */
export function withEffects(run: RunState, effects: readonly Effect[]): RunState {
  return applyEffects(run, effects, []);
}

/** Tonight's upkeep: bills paid or skipped, and what that does to the family. */
function night(run: RunState, env: RunEnv, events: RunEvent[]): RunState {
  const u = upkeep(run, env, run.bills ?? defaultBills(run));
  const family: FamilyMember[] = u.members.map((n) => {
    const m = n.member;
    if (n.change) {
      events.push({ e: 'family', id: m.id, change: n.change });
      return m;
    }
    // Seeded per run, night and person, so replays fall sick the same way.
    if (n.risk > 0 && new Rng(`${run.seed}|night|${run.day}|${m.id}`).chance(n.risk, 100)) {
      events.push({ e: 'family', id: m.id, change: 'sick' });
      return { ...m, status: 'sick', sickNights: 0 };
    }
    return m;
  });
  if (u.draupnir > 0) events.push({ e: 'draupnir', rings: u.draupnir });
  const last = run.ledger[run.ledger.length - 1];
  const ledger =
    last?.day === run.day
      ? [
          ...run.ledger.slice(0, -1),
          {
            ...last,
            night: { ...u.cost, upgrades: run.spent, draupnir: u.draupnir, story: run.storyRings, rings: u.rings },
          },
        ]
      : run.ledger;
  return { ...run, family, rings: u.rings, debtNights: u.debtNights, ledger };
}

/** The day that follows `day` in this run (the slice jumps), or null after its last playable day. */
function dayAfter(run: RunState, campaign: CampaignDef, day: number): number | null {
  const slice = run.slice ? campaign.slice : undefined;
  if (slice) return day >= slice.day ? null : day === slice.after ? slice.day : day + 1;
  return day >= campaign.lastDay ? null : day + 1;
}

/** One coming night's bills, all paid, for the family at home now. */
export interface NightBills {
  readonly day: number;
  readonly hearth: number;
  /** Food for everyone at home now. */
  readonly food: number;
  /** Medicine for each person sick that night. */
  readonly medicine: number;
  readonly draupnir: number;
}

/** The bills of the run's next few nights after tonight (none after its last day), so the night screen can plan. */
export function billForecast(run: RunState, content: Content, nights = 3): NightBills[] {
  const campaign = campaignOf(content);
  const home = run.family.filter((m) => m.status !== 'gone').length;
  const out: NightBills[] = [];
  for (let d = dayAfter(run, campaign, run.day); d !== null && out.length < nights; d = dayAfter(run, campaign, d)) {
    const costs = content.days.find((x) => x.day === d)?.economy?.costs;
    if (!costs) break;
    const draupnir = campaign.draupnir.nights.includes(d) ? campaign.draupnir.rings : 0;
    out.push({ day: d, hearth: costs.hearth, food: costs.food * home, medicine: costs.medicine, draupnir });
  }
  return out;
}

/** The fewest nights in a row below the debt floor that end a run (null if none do in this build). */
export function debtLimit(content: Content): number | null {
  const n = stateMarks(content, 'debtNights').flatMap((m) => (m.atLeast !== undefined ? [m.atLeast] : []));
  return n.length > 0 ? Math.min(...n) : null;
}

/** The endings a run of this build can come to, in the order they're checked (the gallery's list). */
export function reachableEndings(content: Content): readonly EndingDef[] {
  const campaign = campaignOf(content);
  return [...campaign.endings]
    .filter((e) => e.when !== undefined || e.id === campaign.finale)
    .sort((a, b) => a.order - b.order);
}

/** What an ending asks of one of the run's numbers, read from its condition: at least or at most so much. */
export interface StateMark {
  readonly ending: string;
  readonly atLeast?: number;
  readonly atMost?: number;
}

/**
 * The marks the reachable endings set on one number (`ragnarok`, `debtNights` …), in their order.
 * Only conditions every part of which must hold count (`all`), not alternatives (`any`) or negations.
 */
export function stateMarks(content: Content, path: string): StateMark[] {
  const marks: StateMark[] = [];
  const walk = (p: StatePred, ending: string): void => {
    if ('all' in p) for (const q of p.all) walk(q, ending);
    else if ('state' in p && p.state === path) {
      marks.push({
        ending,
        ...(p.gte !== undefined ? { atLeast: p.gte } : {}),
        ...(p.lte !== undefined ? { atMost: p.lte } : {}),
      });
    }
  };
  for (const e of reachableEndings(content)) if (e.when) walk(e.when, e.id);
  return marks;
}

/** The marks the reachable endings set on the host at Ragnarök (none in builds that don't count it). */
export function hostMarks(content: Content): StateMark[] {
  return stateMarks(content, 'ragnarok');
}

/** The first ending whose condition holds, or the finale after the last playable day. */
export function endingFor(run: RunState, content: Content): string | null {
  const campaign = campaignOf(content);
  const hit = [...campaign.endings]
    .sort((a, b) => a.order - b.order)
    .find((e) => e.when !== undefined && evalState(e.when, run));
  if (hit) return hit.id;
  if (run.slice && campaign.slice) return run.day >= campaign.slice.day ? campaign.slice.finale : null;
  return run.day >= campaign.lastDay ? campaign.finale : null;
}

const reject = (run: RunState, reason: string) => ({ state: run, events: [{ e: 'rejected', reason }] as RunEvent[] });

export function stepRun(run: RunState, action: RunAction, env: RunEnv): { state: RunState; events: RunEvent[] } {
  if (run.phase === 'ending') return reject(run, 'the run is over');

  if (action.t === 'scene') {
    if (run.scenes.includes(action.id)) return { state: run, events: [] };
    const events: RunEvent[] = [{ e: 'scene', id: action.id, effects: action.effects }];
    const r = applyEffects({ ...run, scenes: [...run.scenes, action.id] }, action.effects, events);
    return { state: r, events };
  }

  if (action.t === 'appeal') {
    if (run.phase !== 'morning' || !run.appeal) return reject(run, 'no appeal to hear');
    const heard = hearAppeal(run, run.appeal, action.stamped, campaignOf(env.content));
    return { state: heard, events: heard.appealHeard ? [{ e: 'appealed', heard: heard.appealHeard }] : [] };
  }

  switch (action.t) {
    case 'beginShift': {
      if (run.phase !== 'morning') return reject(run, 'the shift starts in the morning');
      // An appeal not heard by the time the gate opens lapses: the verdict stands.
      const today = run.appeal ? hearAppeal(run, run.appeal, null, campaignOf(env.content)) : run;
      const config = {
        mode: 'campaign' as const,
        seed: today.seed,
        day: today.day,
        ...(today.story ? { untimed: true } : {}),
        mods: shiftMods(today, env.content),
      };
      const { state } = startShift(env.content, config, env.queue ?? campaignQueue(today, env));
      const begun = stepShift(
        state,
        { t: 'begin', at: action.at, ...(action.assists ? { assists: action.assists } : {}) },
        env.ctx,
      );
      // The souls who waited through the night are in today's line now.
      const { waiting: _, ...opened } = today;
      return {
        state: { ...opened, phase: 'shift', shift: begun.state },
        events: begun.events.map((event) => ({ e: 'shift', event })),
      };
    }
    case 'shift': {
      if (run.phase !== 'shift' || !run.shift) return reject(run, 'no shift in progress');
      const r = stepShift(run.shift, action.action, env.ctx);
      const events: RunEvent[] = r.events.map((event) => ({ e: 'shift', event }));
      // An action that changes nothing (most ticks) leaves the run as it was, so callers can skip saving it.
      if (r.state === run.shift) return { state: run, events };
      if (r.state.phase !== 'done') return { state: { ...run, shift: r.state }, events };
      const a = audit({ ...run, shift: r.state }, r.state, env);
      const news: RunEvent[] = [];
      const withStory = applyEffects(
        { ...a.run, flags: a.flags, phase: 'audit' },
        storyEffects(r.state, env.content),
        news,
      );
      // The audit files the story's standing since the last audit beside today's mistakes, so they add up.
      const ledger: DayLedger = { ...a.ledger, story: withStory.storyStanding ?? {} };
      events.push({ e: 'audited', ledger }, ...news);
      return {
        state: { ...withStory, storyStanding: {}, ledger: [...withStory.ledger.slice(0, -1), ledger] },
        events,
      };
    }
    case 'endAudit': {
      if (run.phase !== 'audit') return reject(run, 'nothing to audit');
      return { state: { ...run, phase: 'night', bills: defaultBills(run), spent: 0 }, events: [] };
    }
    case 'bills': {
      if (run.phase !== 'night') return reject(run, 'bills are paid at night');
      const home = new Set(run.family.filter((m) => m.status === 'sick').map((m) => m.id));
      const medicine = action.bills.medicine.filter((id) => home.has(id));
      return { state: { ...run, bills: { ...action.bills, medicine } }, events: [] };
    }
    case 'buy': {
      if (run.phase !== 'night') return reject(run, 'the shop opens at night');
      const item = shopFor(run, env.content).find((u) => u.id === action.item);
      if (!item) return reject(run, 'not for sale');
      if (run.rings < item.price) return reject(run, 'not enough rings');
      return {
        state: {
          ...run,
          rings: run.rings - item.price,
          spent: run.spent + item.price,
          upgrades: [...run.upgrades, item.id],
        },
        events: [{ e: 'bought', item: item.id }],
      };
    }
    case 'endNight': {
      if (run.phase !== 'night') return reject(run, 'the night has not come');
      const events: RunEvent[] = [];
      const after = night(run, env, events);
      const ending = endingFor(after, env.content);
      if (ending) {
        events.push({ e: 'ended', ending });
        return { state: { ...after, phase: 'ending', ending, shift: null, bills: null }, events };
      }
      const next = nextMorning(after, campaignOf(env.content));
      events.push({ e: 'dayBegins', day: next.day });
      return {
        state: {
          ...next,
          phase: 'morning',
          shift: null,
          scenes: [],
          storyRings: 0,
          bills: null,
          spent: 0,
        },
        events,
      };
    }
  }
  return reject(run, 'unknown action');
}
