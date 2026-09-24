import { gameContent } from 'virtual:content';
import {
  type DayCtx,
  ENGINE_MAJOR,
  isRunSave,
  type RunAction,
  type RunEnv,
  type RunEvent,
  type RunSave,
  type RunState,
  recordAction,
  replayDay,
  resumeSave,
  runContext,
  type ShiftAction,
  type ShiftEvent,
  type ShiftState,
  startSave,
  stepRun,
} from '@cots/engine';
import { batch, signal } from '@preact/signals';
import {
  clock,
  currentAssists,
  kvStore,
  mirror,
  noteEnding,
  readMirror,
  resetSoulUi,
  resumeClockAt,
  type Screen,
  type Session,
  say,
  screen,
  session,
} from '../store';

/*
 * The campaign's state in the app (docs/tech-spec.md §7): three save slots,
 * the run being played, and every action saved as it happens. The engine's
 * RunSave keeps each morning, so any day can be replayed from its start.
 */

export const SLOT_COUNT = 3;

/** One slot as stored: the engine's save plus a revision, so the newer of two copies wins. */
export interface SlotRecord {
  readonly v: 1;
  readonly rev: number;
  /** Wall-clock time of the last write, for the slot list. */
  readonly savedAt: number;
  /** Clock time last seen with the sun running, so a reload refunds at most a few seconds. */
  readonly seenAt?: number;
  readonly save: RunSave;
}

export interface Active {
  readonly slot: number;
  readonly record: SlotRecord;
  readonly run: RunState;
  readonly ctx: DayCtx;
  /** The save came from another engine version, so its day started again. */
  readonly rewound: boolean;
}

export const slots = signal<readonly (SlotRecord | null)[]>(Array.from({ length: SLOT_COUNT }, () => null));
export const active = signal<Active | null>(null);
/** What the last night brought (family news, Draupnir), for the next morning. */
export const lastNight = signal<readonly RunEvent[]>([]);

const slotKey = (i: number) => `campaign.${i}`;
/** Synchronous copies, like the Daily's: an IndexedDB write in flight is lost if the page unloads. */
const mirrorKey = (i: number) => `cots.campaign.${i}`;

const valid = (r: SlotRecord | null | undefined): SlotRecord | null =>
  r?.v === 1 && typeof r.rev === 'number' && isRunSave(r.save) ? r : null;
const newer = (a: SlotRecord | null, b: SlotRecord | null) => (!a ? b : !b ? a : b.rev > a.rev ? b : a);

export async function loadSlots(): Promise<void> {
  const store = kvStore();
  const loaded = await Promise.all(
    Array.from({ length: SLOT_COUNT }, async (_, i) => {
      const stored = store ? await store.get<SlotRecord>(slotKey(i)).catch(() => undefined) : undefined;
      return newer(valid(stored), valid(readMirror<SlotRecord>(mirrorKey(i))));
    }),
  );
  slots.value = loaded;
}

function write(slot: number, save: RunSave, seenAt?: number): SlotRecord {
  const prev = slots.peek()[slot];
  const record: SlotRecord = {
    v: 1,
    rev: (prev?.rev ?? 0) + 1,
    savedAt: Date.now(),
    ...(seenAt !== undefined ? { seenAt } : {}),
    save,
  };
  slots.value = slots.peek().map((r, i) => (i === slot ? record : r));
  mirror(mirrorKey(slot), record);
  void kvStore()?.set(slotKey(slot), record);
  return record;
}

export function deleteSlot(slot: number): void {
  if (active.peek()?.slot === slot) active.value = null;
  slots.value = slots.peek().map((r, i) => (i === slot ? null : r));
  mirror(mirrorKey(slot), null);
  void kvStore()?.remove(slotKey(slot));
}

export function screenFor(run: RunState): Screen {
  return run.phase === 'morning'
    ? 'morning'
    : run.phase === 'shift'
      ? 'shift'
      : run.phase === 'audit'
        ? 'audit'
        : run.phase === 'night'
          ? 'night'
          : 'ending';
}

/** Steps the run, saves the action and returns what happened. Rejected and empty actions aren't saved. */
export function dispatch(action: RunAction): { run: RunState; events: readonly RunEvent[] } | null {
  const a = active.peek();
  if (!a) return null;
  const save = a.record.save;
  const env: RunEnv = { content: gameContent, ctx: a.ctx, ...(save.queue ? { queue: save.queue } : {}) };
  const r = stepRun(a.run, action, env);
  for (const e of r.events) {
    if (e.e === 'rejected') say(e.reason);
    else if (e.e === 'ended') noteEnding(e.ending);
  }
  if (r.state === a.run) return { run: a.run, events: r.events };
  const record = write(a.slot, recordAction(save, a.run, action, r.state));
  const ctx = r.state.day === a.run.day ? a.ctx : runContext(gameContent, r.state);
  active.value = { ...a, record, run: r.state, ctx };
  return { run: r.state, events: r.events };
}

/** The shift right after it began today, and the shift actions since (for soul reports). */
function shiftHistory(a: Active): { initial: ShiftState; actions: ShiftAction[] } | null {
  const save = a.record.save;
  const morning = save.mornings[save.mornings.length - 1];
  if (!morning) return null;
  let run = morning;
  let initial: ShiftState | null = null;
  const actions: ShiftAction[] = [];
  for (const action of save.log) {
    if (action.t === 'shift') actions.push(action.action);
    if (initial) continue;
    const env: RunEnv = { content: gameContent, ctx: a.ctx, ...(save.queue ? { queue: save.queue } : {}) };
    run = stepRun(run, action, env).state;
    if (action.t === 'beginShift') initial = run.shift;
  }
  return initial ? { initial, actions } : null;
}

/** Shift steps go through the run, so the audit, the save and the shift screen all agree. */
function campaignStep(state: ShiftState, action: ShiftAction): { state: ShiftState; events: ShiftEvent[] } {
  const r = dispatch({ t: 'shift', action });
  if (!r) return { state, events: [] };
  return { state: r.run.shift ?? state, events: r.events.flatMap((e) => (e.e === 'shift' ? [e.event] : [])) };
}

function heartbeat(): void {
  const a = active.peek();
  if (a?.run.phase === 'shift') active.value = { ...a, record: write(a.slot, a.record.save, clock()) };
}

function openShift(a: Active): void {
  const shift = a.run.shift;
  if (!shift) return;
  const history = shiftHistory(a);
  const s: Session = {
    mode: { kind: 'campaign', day: a.run.day, story: a.run.story },
    content: gameContent,
    ctx: a.ctx,
    initial: history?.initial ?? shift,
    state: shift,
    actions: history?.actions ?? [],
    step: campaignStep,
    heartbeat,
  };
  resetSoulUi();
  session.value = s;
}

/** Opens a slot where it was left: mid-shift resumes paused, on the sun's own timeline. */
export function openSlot(slot: number): void {
  const found = slots.peek()[slot];
  if (!found) return;
  const { run, rewound } = resumeSave(found.save, gameContent, ENGINE_MAJOR);
  // Runs that ended before the gallery kept count still count.
  if (run.ending) noteEnding(run.ending);
  // An older engine can't replay today's actions: start the day again from its morning.
  const record =
    rewound || found.save.engine !== ENGINE_MAJOR
      ? write(slot, { ...replayDay(found.save, run.day), engine: ENGINE_MAJOR })
      : found;
  batch(() => {
    active.value = { slot, record, run, ctx: runContext(gameContent, run), rewound };
    lastNight.value = [];
    session.value = null;
  });
  const a = active.peek();
  if (a && run.phase === 'shift' && run.shift) {
    const last = [...record.save.log]
      .reverse()
      .map((x) => (x.t === 'shift' ? x.action.at : x.t === 'beginShift' ? x.at : undefined))
      .find((at) => at !== undefined);
    const resumeAt = Math.max(last ?? 0, record.seenAt ?? 0);
    resumeClockAt(resumeAt);
    if (run.shift.phase === 'shift' && run.shift.clock.pausedAt === null) {
      dispatch({ t: 'shift', action: { t: 'pause', at: resumeAt } });
    }
    const now = active.peek();
    if (now) openShift(now);
  } else if (a && (run.phase === 'audit' || run.phase === 'night') && run.shift) {
    // The audit lists today's souls with their report buttons, which read the shift session.
    openShift(a);
  }
  screen.value = screenFor(run);
}

export function newCampaign(slot: number, story: boolean, slice?: 'play' | 'fromJump'): void {
  // Run seeds are random; everything after is deterministic from the seed.
  const seed = `run:${Date.now().toString(36)}:${Math.floor(Math.random() * 1e9).toString(36)}`;
  write(slot, startSave(gameContent, seed, ENGINE_MAJOR, { story, ...(slice ? { slice } : {}) }));
  openSlot(slot);
}

/** Goes back to the morning of `day`, discarding every later day. */
export function replayFrom(slot: number, day: number): void {
  const found = slots.peek()[slot];
  if (!found) return;
  write(slot, replayDay(found.save, day));
  openSlot(slot);
}

/** The first empty slot, where a replay can branch without losing anything; null when all are taken. */
export function emptySlot(): number | null {
  const i = slots.peek().indexOf(null);
  return i < 0 ? null : i;
}

/** Starts the morning of `day` again in an empty slot, from a copy of this run: the original keeps every day. */
export function branchFrom(slot: number, day: number): void {
  const found = slots.peek()[slot];
  const to = emptySlot();
  if (!found || to === null) return;
  write(to, replayDay(found.save, day));
  openSlot(to);
}

export function toGate(): void {
  // The day's shift takes up the assists as it begins, and the save keeps them with it.
  const story = active.peek()?.run.story === true;
  const assists = currentAssists(!story, story);
  const r = dispatch({ t: 'beginShift', at: clock(), ...(Object.keys(assists).length > 0 ? { assists } : {}) });
  const a = active.peek();
  if (!r || !a || a.run.phase !== 'shift') return;
  openShift(a);
  screen.value = 'shift';
}

export function endAudit(): void {
  if (dispatch({ t: 'endAudit' })) screen.value = 'night';
}

export function sleep(): void {
  const r = dispatch({ t: 'endNight' });
  if (!r) return;
  batch(() => {
    lastNight.value = r.events;
    session.value = null;
    screen.value = screenFor(r.run);
  });
}

export function leaveCampaign(): void {
  batch(() => {
    session.value = null;
    active.value = null;
    screen.value = 'campaign';
  });
}
