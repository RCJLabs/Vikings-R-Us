import type { Content } from '../content/types';
import type { CaseSpec } from '../gen/types';
import { createDayContext, type DayCtx } from '../logic/context';
import { type NewRunOptions, newRun, type RunAction, type RunEnv, stepRun } from './run';
import type { RunState } from './state';

/**
 * A campaign save (docs/tech-spec.md §7): the run as it stood each morning
 * (so any day can be replayed from its start, as in Papers, Please), plus
 * today's actions and today's queue once it exists. The queue is stored,
 * not regenerated, so a mid-day resume stays exact after a generator update.
 */
export interface RunSave {
  readonly format: 'cots.run';
  readonly v: 1;
  /** ENGINE_MAJOR when saved: a different engine can't replay `log`, so it restarts the day. */
  readonly engine: number;
  /** The run at the start of each day played, oldest first. */
  readonly mornings: readonly RunState[];
  /** Actions since the latest morning. */
  readonly log: readonly RunAction[];
  /** Today's queue, once the shift has begun. */
  readonly queue: readonly CaseSpec[] | null;
}

export function runContext(content: Content, run: RunState): DayCtx {
  return createDayContext(content, run.day, run.seed);
}

export function startSave(content: Content, seed: string, engine: number, opts: NewRunOptions = {}): RunSave {
  return { format: 'cots.run', v: 1, engine, mornings: [newRun(content, seed, opts)], log: [], queue: null };
}

/** Records an action taken on `before` (the result is `after`), starting a new morning when the day turns. */
export function recordAction(save: RunSave, before: RunState, action: RunAction, after: RunState): RunSave {
  if (after.day !== before.day && after.phase === 'morning') {
    return { ...save, mornings: [...save.mornings, after], log: [], queue: null };
  }
  const queue = save.queue ?? (after.shift ? after.shift.cases : null);
  return { ...save, log: [...save.log, action], queue };
}

/**
 * Rebuilds the current run from a save. If the engine changed since it was
 * saved, today's actions can't be trusted to replay the same way, so the day
 * restarts from its morning ("the Norns rewound the day").
 */
export function resumeSave(save: RunSave, content: Content, engine: number): { run: RunState; rewound: boolean } {
  const morning = save.mornings[save.mornings.length - 1];
  if (!morning) throw new Error('A save needs at least one morning');
  if (save.engine !== engine) return { run: morning, rewound: save.log.length > 0 };
  let run = morning;
  const ctx = runContext(content, run);
  for (const action of save.log) {
    const env: RunEnv = { content, ctx, ...(save.queue ? { queue: save.queue } : {}) };
    run = stepRun(run, action, env).state;
  }
  return { run, rewound: false };
}

/** Days that can be replayed from their start (every morning in the save). */
export function replayableDays(save: RunSave): number[] {
  return save.mornings.map((m) => m.day);
}

/** Goes back to the morning of `day`, discarding every later day. */
export function replayDay(save: RunSave, day: number): RunSave {
  const i = save.mornings.findIndex((m) => m.day === day);
  if (i < 0) throw new RangeError(`No morning saved for day ${day}`);
  return { ...save, mornings: save.mornings.slice(0, i + 1), log: [], queue: null };
}

/** A structural check for saves read back from storage (anything else is treated as missing). */
export function isRunSave(x: unknown): x is RunSave {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Partial<RunSave>;
  return (
    s.format === 'cots.run' &&
    s.v === 1 &&
    typeof s.engine === 'number' &&
    Array.isArray(s.mornings) &&
    s.mornings.length > 0 &&
    Array.isArray(s.log) &&
    (s.queue === null || Array.isArray(s.queue))
  );
}
