import type { Content, Destination, ToolId } from '../content/types';
import { DESTINATIONS } from '../content/types';
import { generateDay } from '../gen/generate';
import type { CaseSpec, Field } from '../gen/types';
import { createDayContext, type DayCtx } from '../logic/context';
import { isPerceivable, solve } from '../logic/solver';
import { type QuestionResponse, questionResponse } from '../narrative/questions';
import { fnv1a32 } from '../rng/hash';

/**
 * One shift at the gate: a queue of souls under a sun timer. Pure and
 * deterministic: the UI passes timestamps (`at`, integer ms on any monotonic
 * clock) and the engine never reads a clock (docs/tech-spec.md §4).
 */

/** Speed-only changes from campaign upgrades (docs/build-plan.md §1). */
export interface ShiftMods {
  /** Replacement sun costs, in seconds, for tools (including turning the body over). */
  readonly toolCostS?: Readonly<Partial<Record<ToolId, number>>>;
  readonly questionS?: number;
  /** Extra sun for the whole shift. */
  readonly sunS?: number;
}

export interface ShiftConfig {
  readonly mode: 'daily' | 'practice' | 'primer' | 'campaign';
  readonly seed: string;
  /** The mechanics day: a campaign day for practice, the Daily spec's day for the Daily. */
  readonly day: number;
  readonly dailyNumber?: number;
  /** No sun timer (Story Mode, practice). */
  readonly untimed?: boolean;
  readonly mods?: ShiftMods;
}

export interface SoulState {
  readonly seen: readonly string[];
  readonly view: 'front' | 'back';
  readonly flipped: boolean;
  readonly tools: readonly ToolId[];
  /** Contradictions the player called out: the lying field and the field it was compared with. */
  readonly flagged: readonly { readonly lie: string; readonly fact: string; readonly with: string }[];
  readonly questioned: readonly string[];
  readonly stamp: Destination | null;
}

export interface Verdict {
  readonly index: number;
  /** null: the sun set before this soul was judged. */
  readonly stamped: Destination | null;
  readonly expected: Destination;
  readonly rule: string;
  readonly correct: boolean;
  /** Proof fields the player never looked at, for the citation. */
  readonly missed: readonly string[];
  /** Procedures the soul needed that weren't done (e.g. nails left unclipped). */
  readonly skipped?: readonly string[];
  readonly caught: number;
  readonly lies: number;
  readonly atMs: number;
}

export interface ShiftClock {
  readonly startedAt: number | null;
  readonly pausedAt: number | null;
  readonly pausedMs: number;
  readonly penaltyMs: number;
  readonly dusk: boolean;
}

export interface ShiftState {
  readonly v: 1;
  readonly config: ShiftConfig;
  readonly phase: 'briefing' | 'shift' | 'done';
  readonly sunMs: number;
  readonly cases: readonly CaseSpec[];
  readonly cursor: number;
  readonly soul: SoulState;
  readonly clock: ShiftClock;
  readonly verdicts: readonly Verdict[];
  readonly endedBy: 'queue' | 'dusk' | null;
  /** Question templates used lately, so answers don't repeat (last 20). */
  readonly recentQ: readonly string[];
}

export type ShiftAction =
  | { readonly t: 'begin'; readonly at: number }
  | { readonly t: 'inspect'; readonly fields: readonly string[]; readonly at: number }
  | { readonly t: 'flip'; readonly at: number }
  | { readonly t: 'tool'; readonly tool: ToolId; readonly at: number }
  | { readonly t: 'compare'; readonly a: string; readonly b: string; readonly at: number }
  | { readonly t: 'question'; readonly lie: string; readonly at: number }
  | { readonly t: 'stamp'; readonly dest: Destination; readonly at: number }
  | { readonly t: 'send'; readonly at: number }
  | { readonly t: 'pause'; readonly at: number }
  | { readonly t: 'resume'; readonly at: number }
  | { readonly t: 'tick'; readonly at: number };

export type ShiftEvent =
  | { readonly e: 'begun' }
  | { readonly e: 'inspected'; readonly fields: readonly string[] }
  | { readonly e: 'flipped'; readonly view: 'front' | 'back'; readonly penaltyMs: number }
  | { readonly e: 'toolUsed'; readonly tool: ToolId; readonly fields: readonly string[]; readonly penaltyMs: number }
  | { readonly e: 'contradiction'; readonly lie: string; readonly fact: string; readonly with: string }
  | { readonly e: 'noConflict'; readonly a: string; readonly b: string; readonly penaltyMs: number }
  | { readonly e: 'answer'; readonly lie: string; readonly response: QuestionResponse; readonly penaltyMs: number }
  | { readonly e: 'stamped'; readonly dest: Destination }
  | { readonly e: 'judged'; readonly verdict: Verdict }
  | { readonly e: 'citation'; readonly verdict: Verdict }
  | { readonly e: 'dusk' }
  | { readonly e: 'done'; readonly endedBy: 'queue' | 'dusk' }
  | { readonly e: 'paused' }
  | { readonly e: 'resumed' }
  | { readonly e: 'rejected'; readonly reason: string };

/** Sun penalties in ms (docs/tech-spec.md §4). Tool costs come from content. */
export const PENALTY = { badCompare: 10_000, question: 20_000 } as const;
/** How long the current soul may still be judged after dusk. */
export const DUSK_GRACE_MS = 60_000;

const freshSoul = (): SoulState => ({
  seen: [],
  view: 'front',
  flipped: false,
  tools: [],
  flagged: [],
  questioned: [],
  stamp: null,
});

/** The day context a shift plays in (the Daily and the primer have their own specs). */
export function shiftContext(content: Content, config: ShiftConfig): DayCtx {
  if (config.mode === 'daily') {
    if (!content.daily) throw new Error('This build has no Daily Shift');
    return createDayContext(content, content.daily.day, config.seed, content.daily);
  }
  if (config.mode === 'primer') {
    if (!content.primer) throw new Error('This build has no primer');
    return createDayContext(content, content.primer.day, config.seed, content.primer);
  }
  // Practice and campaign days play the day's own spec.
  return createDayContext(content, config.day, config.seed);
}

/**
 * A new shift in its briefing. `queue` replaces generation with an already
 * generated queue (a saved campaign day), so a resume stays exact even after
 * the generator changes.
 */
export function startShift(
  content: Content,
  config: ShiftConfig,
  queue?: readonly CaseSpec[],
): { state: ShiftState; ctx: DayCtx } {
  const ctx = shiftContext(content, config);
  const cases = queue ?? generateDay(config.seed, ctx).cases;
  const state: ShiftState = {
    v: 1,
    config: { ...config, day: ctx.day },
    phase: 'briefing',
    sunMs: (ctx.spec.sunS + (config.mods?.sunS ?? 0)) * 1000,
    cases,
    cursor: 0,
    soul: freshSoul(),
    clock: { startedAt: null, pausedAt: null, pausedMs: 0, penaltyMs: 0, dusk: false },
    verdicts: [],
    endedBy: null,
    recentQ: [],
  };
  return { state, ctx };
}

/** Sun time used so far: real time since the start, minus pauses, plus penalties. */
export function sunElapsed(state: ShiftState, at: number): number {
  const { startedAt, pausedAt, pausedMs, penaltyMs } = state.clock;
  if (startedAt === null) return 0;
  const paused = pausedMs + (pausedAt !== null ? Math.max(0, at - pausedAt) : 0);
  return Math.max(0, at - startedAt - paused + penaltyMs);
}

export function sunLeft(state: ShiftState, at: number): number {
  return Math.max(0, state.sunMs - sunElapsed(state, at));
}

export function currentCase(state: ShiftState): CaseSpec | undefined {
  return state.phase === 'shift' ? state.cases[state.cursor] : undefined;
}

/** The fields the player could inspect right now (the back needs the flip; tool readings need the tool). */
export function inspectable(state: ShiftState, ctx: DayCtx): Field[] {
  const c = currentCase(state);
  if (!c) return [];
  return c.evidence.fields.filter(
    (f) =>
      isPerceivable(f, ctx) &&
      (f.view !== 'back' || state.soul.flipped) &&
      (f.tool === undefined || state.soul.tools.includes(f.tool)),
  );
}

/** Stamps available today, in a stable order. */
export function stampsFor(ctx: DayCtx): Destination[] {
  return DESTINATIONS.filter((d) => ctx.destinations.has(d));
}

/** A tool's sun cost in seconds today, after upgrades; undefined if the tool isn't taught yet. */
export function toolCost(state: ShiftState, ctx: DayCtx, tool: ToolId): number | undefined {
  const base = ctx.tools.get(tool);
  if (base === undefined) return undefined;
  return state.config.mods?.toolCostS?.[tool] ?? base;
}

/** What questioning a liar costs, in sun-ms, after upgrades. */
export function questionCostMs(state: ShiftState): number {
  const s = state.config.mods?.questionS;
  return s === undefined ? PENALTY.question : s * 1000;
}

function reject(state: ShiftState, reason: string): { state: ShiftState; events: ShiftEvent[] } {
  return { state, events: [{ e: 'rejected', reason }] };
}

function penalize(state: ShiftState, ms: number): ShiftState {
  return ms > 0 ? { ...state, clock: { ...state.clock, penaltyMs: state.clock.penaltyMs + ms } } : state;
}

function finish(state: ShiftState, endedBy: 'queue' | 'dusk', at: number): { state: ShiftState; events: ShiftEvent[] } {
  const atMs = sunElapsed(state, at);
  const unjudged: Verdict[] = state.cases.slice(state.verdicts.length).map((c, i) => ({
    index: state.verdicts.length + i,
    stamped: null,
    expected: c.expect.dest,
    rule: c.expect.rule,
    correct: false,
    missed: [],
    caught: 0,
    lies: c.lies.length,
    atMs,
  }));
  return {
    state: { ...state, phase: 'done', endedBy, verdicts: [...state.verdicts, ...unjudged], soul: freshSoul() },
    events: [{ e: 'done', endedBy }],
  };
}

/** Checks dusk (and the grace after it); returns events for anything that happened. */
function checkSun(state: ShiftState, at: number): { state: ShiftState; events: ShiftEvent[] } {
  if (state.config.untimed || state.phase !== 'shift' || state.clock.pausedAt !== null) {
    return { state, events: [] };
  }
  const elapsed = sunElapsed(state, at);
  const events: ShiftEvent[] = [];
  let s = state;
  if (!s.clock.dusk && elapsed >= s.sunMs) {
    s = { ...s, clock: { ...s.clock, dusk: true } };
    events.push({ e: 'dusk' });
  }
  if (s.clock.dusk && elapsed >= s.sunMs + DUSK_GRACE_MS) {
    const f = finish(s, 'dusk', at);
    return { state: f.state, events: [...events, ...f.events] };
  }
  return { state: s, events };
}

/** Advances a shift by one action. Invalid actions leave the state unchanged and emit `rejected`. */
export function stepShift(
  state: ShiftState,
  action: ShiftAction,
  ctx: DayCtx,
): { state: ShiftState; events: ShiftEvent[] } {
  if (action.t === 'begin') {
    if (state.phase !== 'briefing') return reject(state, 'the shift has already begun');
    return {
      state: { ...state, phase: 'shift', clock: { ...state.clock, startedAt: action.at } },
      events: [{ e: 'begun' }],
    };
  }
  if (state.phase !== 'shift') return reject(state, 'no shift in progress');

  if (action.t === 'pause') {
    if (state.clock.pausedAt !== null) return { state, events: [] };
    return { state: { ...state, clock: { ...state.clock, pausedAt: action.at } }, events: [{ e: 'paused' }] };
  }
  if (action.t === 'resume') {
    const { pausedAt } = state.clock;
    if (pausedAt === null) return { state, events: [] };
    const clock = {
      ...state.clock,
      pausedAt: null,
      pausedMs: state.clock.pausedMs + Math.max(0, action.at - pausedAt),
    };
    return { state: { ...state, clock }, events: [{ e: 'resumed' }] };
  }
  if (state.clock.pausedAt !== null) return reject(state, 'the shift is paused');

  const sun = checkSun(state, action.at);
  if (sun.state.phase !== 'shift' || action.t === 'tick') return sun;
  const s = sun.state;
  const c = s.cases[s.cursor];
  if (!c) return sun;
  const withSun = (r: { state: ShiftState; events: ShiftEvent[] }) => ({
    state: r.state,
    events: [...sun.events, ...r.events],
  });

  switch (action.t) {
    case 'inspect': {
      const ids = new Set(inspectable(s, ctx).map((f) => f.id));
      const fresh = action.fields.filter((id) => ids.has(id) && !s.soul.seen.includes(id));
      if (fresh.length === 0) return withSun({ state: s, events: [] });
      return withSun({
        state: { ...s, soul: { ...s.soul, seen: [...s.soul.seen, ...fresh] } },
        events: [{ e: 'inspected', fields: fresh }],
      });
    }
    case 'flip': {
      const cost = toolCost(s, ctx, 'flip');
      if (cost === undefined) return withSun(reject(s, 'you cannot turn bodies over yet'));
      const penalty = s.soul.flipped ? 0 : cost * 1000;
      const view = s.soul.view === 'front' ? 'back' : 'front';
      return withSun({
        state: penalize({ ...s, soul: { ...s.soul, view, flipped: true } }, penalty),
        events: [{ e: 'flipped', view, penaltyMs: penalty }],
      });
    }
    case 'tool': {
      const cost = toolCost(s, ctx, action.tool);
      if (cost === undefined || action.tool === 'flip') return withSun(reject(s, `no ${action.tool} today`));
      if (s.soul.tools.includes(action.tool)) return withSun({ state: s, events: [] });
      const readings = c.evidence.fields.filter((f) => f.tool === action.tool).map((f) => f.id);
      const soul = { ...s.soul, tools: [...s.soul.tools, action.tool], seen: [...s.soul.seen, ...readings] };
      return withSun({
        state: penalize({ ...s, soul }, cost * 1000),
        events: [{ e: 'toolUsed', tool: action.tool, fields: readings, penaltyMs: cost * 1000 }],
      });
    }
    case 'compare': {
      const { a, b } = action;
      if (a === b || !s.soul.seen.includes(a) || !s.soul.seen.includes(b)) {
        return withSun(reject(s, 'compare two things you have looked at'));
      }
      const seenFields = c.evidence.fields.filter((f) => s.soul.seen.includes(f.id));
      const found = solve(seenFields, ctx).contradictions.find(
        (x) => (x.lie === a && x.against.includes(b)) || (x.lie === b && x.against.includes(a)),
      );
      if (!found) {
        return withSun({
          state: penalize(s, PENALTY.badCompare),
          events: [{ e: 'noConflict', a, b, penaltyMs: PENALTY.badCompare }],
        });
      }
      if (s.soul.flagged.some((f) => f.lie === found.lie)) return withSun({ state: s, events: [] });
      const other = found.lie === a ? b : a;
      const flagged = [...s.soul.flagged, { lie: found.lie, fact: found.fact, with: other }];
      return withSun({
        state: { ...s, soul: { ...s.soul, flagged } },
        events: [{ e: 'contradiction', lie: found.lie, fact: found.fact, with: other }],
      });
    }
    case 'question': {
      if (!s.soul.flagged.some((f) => f.lie === action.lie))
        return withSun(reject(s, 'call out a contradiction first'));
      if (s.soul.questioned.includes(action.lie)) return withSun(reject(s, 'already questioned'));
      const response = questionResponse(c, action.lie, ctx.content, s.recentQ);
      if (!response) return withSun(reject(s, 'this soul has nothing to say'));
      const recentQ = [...s.recentQ, response.template].slice(-20);
      const cost = questionCostMs(s);
      return withSun({
        state: penalize({ ...s, recentQ, soul: { ...s.soul, questioned: [...s.soul.questioned, action.lie] } }, cost),
        events: [{ e: 'answer', lie: action.lie, response, penaltyMs: cost }],
      });
    }
    case 'stamp': {
      if (!ctx.destinations.has(action.dest)) return withSun(reject(s, `no ${action.dest} stamp today`));
      return withSun({
        state: { ...s, soul: { ...s.soul, stamp: action.dest } },
        events: [{ e: 'stamped', dest: action.dest }],
      });
    }
    case 'send': {
      const stamped = s.soul.stamp;
      if (!stamped) return withSun(reject(s, 'choose a stamp first'));
      const skipped = (c.expect.procedures ?? []).filter((id) => {
        const p = ctx.procedures.find((x) => x.id === id);
        return !p || !s.soul.tools.includes(p.tool);
      });
      const verdict: Verdict = {
        index: s.cursor,
        stamped,
        expected: c.expect.dest,
        rule: c.expect.rule,
        correct: stamped === c.expect.dest && skipped.length === 0,
        missed: c.meta.proof.filter((id) => !s.soul.seen.includes(id)),
        ...(skipped.length > 0 ? { skipped } : {}),
        caught: s.soul.flagged.length,
        lies: c.lies.length,
        atMs: sunElapsed(s, action.at),
      };
      const events: ShiftEvent[] = [{ e: 'judged', verdict }];
      if (!verdict.correct) events.push({ e: 'citation', verdict });
      const next: ShiftState = { ...s, cursor: s.cursor + 1, verdicts: [...s.verdicts, verdict], soul: freshSoul() };
      if (next.cursor >= next.cases.length) {
        const f = finish(next, 'queue', action.at);
        return withSun({ state: f.state, events: [...events, ...f.events] });
      }
      if (next.clock.dusk) {
        const f = finish(next, 'dusk', action.at);
        return withSun({ state: f.state, events: [...events, ...f.events] });
      }
      return withSun({ state: next, events });
    }
  }
  return sun;
}

export interface ShiftScore {
  readonly correct: number;
  readonly judged: number;
  readonly total: number;
  readonly citations: number;
  readonly caught: number;
  /** Sun left when the last soul was sent (0 if the sun set). */
  readonly spareMs: number;
}

export function shiftScore(state: ShiftState): ShiftScore {
  const judged = state.verdicts.filter((v) => v.stamped !== null);
  const last = judged[judged.length - 1];
  return {
    correct: judged.filter((v) => v.correct).length,
    judged: judged.length,
    total: state.cases.length,
    citations: judged.filter((v) => !v.correct).length,
    caught: judged.reduce((n, v) => n + v.caught, 0),
    spareMs: state.endedBy === 'queue' && last ? Math.max(0, state.sunMs - last.atMs) : 0,
  };
}

/** One mark per soul: right, wrong, or not judged before dusk. */
export function shareMarks(state: ShiftState): string {
  return state.verdicts.map((v) => (v.stamped === null ? '⬛' : v.correct ? '🟩' : '🟥')).join('');
}

const clockText = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Spoiler-free share text: right, wrong and unjudged per soul, never
 * destinations. Carries the generator version so results only compare
 * across the same Daily.
 */
export function shareText(
  state: ShiftState,
  content: Content,
  opts: { title: string; label?: string; decree?: string; url?: string },
): string {
  const score = shiftScore(state);
  const marks = shareMarks(state);
  const label =
    opts.label ??
    (state.config.mode === 'daily'
      ? `Daily #${state.config.dailyNumber ?? '?'}`
      : state.config.mode === 'primer'
        ? 'Primer'
        : `Day ${state.config.day} practice`);
  const tail = state.endedBy === 'dusk' ? 'sun set' : `${clockText(score.spareMs)} to spare`;
  return [
    `${opts.title} · ${label} (g${content.genVersion})`,
    ...(opts.decree ? [opts.decree] : []),
    `${marks} ${score.correct}/${score.total} · ${tail}`,
    ...(opts.url ? [opts.url] : []),
  ].join('\n');
}

/**
 * A checksum of everything a player sees and must decide in a queue: same
 * checksum, same shift. Golden tests pin it for upcoming Dailies, and the
 * alpha's guard compares it across devices.
 */
export function queueChecksum(cases: readonly CaseSpec[], ctx: DayCtx): string {
  const params = Object.keys(ctx.paramChoices)
    .sort()
    .map((k) => [k, ctx.paramChoices[k]?.id ?? null]);
  const body = cases.map((c) => [c.id, c.archetype, c.truth, c.lies, c.evidence, c.expect]);
  return fnv1a32(JSON.stringify([ctx.content.genVersion, ctx.day, params, body]))
    .toString(16)
    .padStart(8, '0');
}
