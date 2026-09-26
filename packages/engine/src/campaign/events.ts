import type { Content, DayEventDef, DaySpec, EventSouls } from '../content/types';
import { generateCase, planDay, reachOf } from '../gen/generate';
import type { CaseSpec } from '../gen/types';
import { createDayContext, type DayCtx } from '../logic/context';
import { Rng } from '../rng/rng';
import type { DayEventAt, RunState } from './state';

/*
 * Day events (docs/tech-spec.md §52): a storm, a sickness, a battle, a feast. A run draws a few from its seed as it
 * begins and keeps them, so a day replayed from its morning has the same one. Each changes its day's line (some of
 * the day's own souls don't come, others do), the sun, and that night's bills and sickness, and never the rules:
 * the souls it brings are made and judged as any day's are.
 */

/**
 * The days an event can fall on: from `from` to `to` (and no later than the build's last day), each a campaign day
 * with no noon decree, whose raven already changes it.
 */
export function eventDays(content: Content): number[] {
  const def = content.campaign?.events;
  if (!def) return [];
  const last = Math.min(def.to, content.campaign?.lastDay ?? 0);
  const out: number[] = [];
  for (let d = def.from; d <= last; d++) {
    const spec = content.days.find((s) => s.day === d);
    if (spec?.economy && !spec.noon && !spec.queue.script) out.push(d);
  }
  return out;
}

/**
 * A run's day events, from its seed: `perRun` different events, each on a day it can come to (from its `since`), no
 * two on the same day or on days running. Fewer if the days run out.
 */
export function drawEvents(content: Content, seed: string): DayEventAt[] {
  const def = content.campaign?.events;
  if (!def) return [];
  const days = eventDays(content);
  const rng = new Rng(`${seed}|events`);
  const drawn: DayEventAt[] = [];
  for (const ev of rng.shuffle(def.pool)) {
    if (drawn.length >= def.perRun) break;
    const open = days.filter((d) => d >= ev.since && drawn.every((e) => Math.abs(e.day - d) > 1));
    if (open.length > 0) drawn.push({ day: rng.pick(open), id: ev.id });
  }
  return drawn.sort((a, b) => a.day - b.day);
}

/** The event the run drew for `day`, if any. */
export function eventOn(run: Pick<RunState, 'events'>, content: Content, day: number): DayEventDef | undefined {
  const at = run.events?.find((e) => e.day === day);
  return at ? content.campaign?.events?.pool.find((e) => e.id === at.id) : undefined;
}

/** `n` in percent `p`, to the nearest whole number (half up). */
const pct = (n: number, p: number | undefined): number => (p === undefined ? n : Math.floor((n * p + 50) / 100));

/** A day's spec as an event leaves it: its sun and the night's bills (its line is `eventLine`'s). */
export function withEvent(spec: DaySpec, ev: DayEventDef): DaySpec {
  const e = spec.economy;
  const c = ev.costsPct;
  const economy =
    e && c
      ? {
          ...e,
          costs: {
            hearth: pct(e.costs.hearth, c.hearth),
            food: pct(e.costs.food, c.food),
            medicine: pct(e.costs.medicine, c.medicine),
          },
        }
      : e;
  return { ...spec, sunS: pct(spec.sunS, ev.sunPct), ...(economy ? { economy } : {}) };
}

/** The souls an event brings to `day` (those it brings from a day on, or until one). */
export function eventSoulsOn(ev: DayEventDef, day: number): EventSouls[] {
  return (ev.souls ?? []).filter((s) => (s.since ?? 1) <= day && (s.until === undefined || day < s.until));
}

/** How many souls more an event makes `day`'s line (fewer, below 0): those it brings, less those who don't come. */
export function eventLineChange(ev: DayEventDef, day: number): number {
  return eventSoulsOn(ev, day).reduce((n, s) => n + s.n, 0) - (ev.fewer ?? 0);
}

/** Where event souls start in the procedural index, past the day's own and any a rank adds. */
const EVENT_INDEX = 64;

/**
 * The day's own line (`cases`, its teaching soul first when `front` is 1) as an event leaves it: the last `fewer`
 * of its own souls don't come (never the teaching soul), and the event's souls come at places drawn on a stream of
 * its own, after the teaching soul. Each is made as the day's souls are, of its kind if the generator can, bound for
 * the first destination in `to` that kind reaches today; one who'd share a name with a soul in the line is passed
 * over for another. The day's own souls are the same with the event or without it.
 */
export function eventLine(
  seed: string,
  ctx: DayCtx,
  cases: readonly CaseSpec[],
  front: number,
  ev: DayEventDef,
): CaseSpec[] {
  const line = cases.slice(0, Math.max(front + 1, cases.length - (ev.fewer ?? 0)));
  const reach = reachOf(ctx);
  const names = new Set(line.map((c) => `${c.evidence.look.name} ${c.evidence.look.patronym}`));
  const rng = new Rng(`${ctx.content.genVersion}|${seed}|${ctx.day}|event|${ev.id}`);
  let i = planDay(seed, ctx).count + EVENT_INDEX;
  for (const s of eventSoulsOn(ev, ctx.day)) {
    const to = s.to.find((d) => reach.get(s.kind)?.has(d) && ctx.destinations.has(d));
    if (!to) continue;
    for (let k = 0; k < s.n; k++) {
      for (let tries = 0; tries < 4; tries++, i++) {
        const c = generateCase(seed, ctx, i, to, { teach: s.kind }).case;
        const name = `${c.evidence.look.name} ${c.evidence.look.patronym}`;
        if (names.has(name)) continue;
        names.add(name);
        line.splice(rng.int(front, line.length), 0, c);
        i++;
        break;
      }
    }
  }
  return line;
}

/** The spec the run plays `day` by: the day's own, with the event the run drew for it. */
export function daySpecFor(content: Content, run: Pick<RunState, 'events'>, day: number): DaySpec | undefined {
  const spec = content.days.find((d) => d.day === day);
  const ev = spec ? eventOn(run, content, day) : undefined;
  return spec && ev ? withEvent(spec, ev) : spec;
}

/** The context the run plays `day` in, its event included (`runContext` is today's). */
export function dayContext(content: Content, run: Pick<RunState, 'seed' | 'events'>, day: number): DayCtx {
  return createDayContext(content, day, run.seed, daySpecFor(content, run, day));
}
