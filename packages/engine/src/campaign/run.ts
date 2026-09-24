import type {
  CampaignDef,
  Content,
  Destination,
  Economy,
  Effect,
  Faction,
  SliceDef,
  UpgradeDef,
} from '../content/types';
import { FACTIONS } from '../content/types';
import { generateDay } from '../gen/generate';
import { scriptedCase } from '../gen/scripted';
import type { CaseSpec } from '../gen/types';
import type { DayCtx } from '../logic/context';
import { eval2 } from '../logic/pred';
import { Rng } from '../rng/rng';
import {
  type ShiftAction,
  type ShiftEvent,
  type ShiftMods,
  type ShiftState,
  startShift,
  stepShift,
  type Verdict,
} from '../shift/shift';
import { type Bills, type DayLedger, evalState, type FamilyMember, type RunState } from './state';

/*
 * The campaign's day loop (docs/tech-spec.md §4):
 *   morning -> beginShift -> shift -> audit -> endAudit -> night -> endNight -> next morning
 * Scenes (morning and night) arrive as `scene` actions carrying their effects,
 * which the story layer computes from the player's choices.
 */

export type RunAction =
  | { readonly t: 'beginShift'; readonly at: number }
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
  | { readonly t: 'endNight' };

export type RunEvent =
  | { readonly e: 'shift'; readonly event: ShiftEvent }
  | { readonly e: 'audited'; readonly ledger: DayLedger }
  | { readonly e: 'bought'; readonly item: string }
  | { readonly e: 'scene'; readonly id: string; readonly effects: readonly Effect[] }
  | { readonly e: 'family'; readonly id: string; readonly change: 'sick' | 'well' | 'died' | 'left' }
  | { readonly e: 'draupnir'; readonly rings: number }
  | { readonly e: 'dayBegins'; readonly day: number }
  | { readonly e: 'ended'; readonly ending: string }
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
  return {
    ...(Object.keys(toolCostS).length > 0 ? { toolCostS } : {}),
    ...(questionS !== undefined ? { questionS } : {}),
    ...(sunS > 0 ? { sunS } : {}),
  };
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

/**
 * Today's queue: the generated souls, with the day's story souls placed among
 * them. Generated souls are the same with or without the story souls, which
 * only appear when their `when` holds as the shift begins.
 */
export function campaignQueue(run: RunState, env: RunEnv): CaseSpec[] {
  const cases = generateDay(run.seed, env.ctx).cases.slice();
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
  shift.verdicts.forEach((v: Verdict) => {
    const c = shift.cases[v.index];
    if (v.stamped === null) {
      unjudged++;
      return;
    }
    if (v.correct) {
      correct++;
      pay += economy.wage;
      if (v.caught > 0) bonus += economy.docBonus;
    } else {
      wrong++;
      if (!run.story && wrong > economy.warnings) {
        const i = Math.min(wrong - economy.warnings - 1, economy.fines.length - 1);
        fines += economy.fines[i] ?? 0;
      }
    }
    // Only mistakes move standing: a god isn't angered (or flattered) by a soul sent where it belongs.
    const rule = v.correct
      ? undefined
      : campaign.standing.find((r) => matches(r.expected, v.expected) && matches(r.stamped, v.stamped as Destination));
    for (const [f, n] of Object.entries(rule?.fx ?? {}))
      standing[f as Faction] = (standing[f as Faction] ?? 0) + (n ?? 0);
    if (v.stamped === 'VALHALLA' && c) {
      if (eval2({ ref: campaign.worthy }, c.truth, env.ctx)) einherjar.worthy++;
      else einherjar.unworthy++;
    }
    sent[v.stamped] = (sent[v.stamped] ?? 0) + 1;
    // Every soul sent on with a procedure skipped (so far only nails left uncut) builds Naglfar.
    naglfar += v.skipped?.length ?? 0;
  });
  const ledger: DayLedger = { day: run.day, correct, wrong, unjudged, pay, bonus, fines, standing };
  const nextStanding = { ...run.standing };
  for (const [f, n] of Object.entries(standing)) nextStanding[f as Faction] += n ?? 0;
  return {
    run: {
      ...run,
      rings: run.rings + pay + bonus - fines,
      standing: nextStanding,
      einherjar,
      sent,
      naglfar,
      ledger: [...run.ledger, ledger],
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

/** Tonight's upkeep: bills paid or skipped, and what that does to the family. */
function night(run: RunState, env: RunEnv, events: RunEvent[]): RunState {
  const campaign = campaignOf(env.content);
  const economy = economyOf(env);
  const bills = run.bills ?? defaultBills(run);
  const cost = billTotal(run, economy, bills);
  const adults = new Map(campaign.family.map((f) => [f.id, f.adult]));
  const family: FamilyMember[] = run.family.map((m) => {
    if (m.status === 'gone') return m;
    const cold = bills.hearth ? 0 : m.cold + 1;
    const hungry = bills.food ? 0 : m.hungry + 1;
    if (m.status === 'sick') {
      if (bills.medicine.includes(m.id)) {
        events.push({ e: 'family', id: m.id, change: 'well' });
        return { ...m, status: 'well', cold, hungry, sickNights: 0 };
      }
      const sickNights = m.sickNights + 1;
      if (sickNights >= campaign.care.sickNights) {
        const gone = adults.get(m.id) ? 'died' : 'left';
        events.push({ e: 'family', id: m.id, change: gone });
        return { ...m, status: 'gone', gone, cold, hungry, sickNights };
      }
      return { ...m, cold, hungry, sickNights };
    }
    // Seeded per run, night and person, so replays fall sick the same way.
    const unmet = (bills.hearth ? 0 : 1) + (bills.food ? 0 : 1);
    const chance = new Rng(`${run.seed}|night|${run.day}|${m.id}`).chance(unmet * campaign.care.sickChance, 100);
    if (cold >= campaign.care.needNights || hungry >= campaign.care.needNights || (unmet > 0 && chance)) {
      events.push({ e: 'family', id: m.id, change: 'sick' });
      return { ...m, status: 'sick', cold, hungry, sickNights: 0 };
    }
    return { ...m, cold, hungry };
  });
  const draupnir = campaign.draupnir.nights.includes(run.day) ? campaign.draupnir.rings : 0;
  if (draupnir > 0) events.push({ e: 'draupnir', rings: draupnir });
  const rings = run.rings - cost.hearth - cost.food - cost.medicine + draupnir;
  const last = run.ledger[run.ledger.length - 1];
  const ledger =
    last?.day === run.day
      ? [
          ...run.ledger.slice(0, -1),
          { ...last, night: { ...cost, upgrades: run.spent, draupnir, story: run.storyRings, rings } },
        ]
      : run.ledger;
  return {
    ...run,
    family,
    rings,
    debtNights: rings < campaign.debtFloor ? run.debtNights + 1 : 0,
    ledger,
  };
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

  switch (action.t) {
    case 'beginShift': {
      if (run.phase !== 'morning') return reject(run, 'the shift starts in the morning');
      const config = {
        mode: 'campaign' as const,
        seed: run.seed,
        day: run.day,
        ...(run.story ? { untimed: true } : {}),
        mods: shiftMods(run, env.content),
      };
      const { state } = startShift(env.content, config, env.queue ?? campaignQueue(run, env));
      const begun = stepShift(state, { t: 'begin', at: action.at }, env.ctx);
      return {
        state: { ...run, phase: 'shift', shift: begun.state },
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
