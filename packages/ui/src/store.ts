import { dailyContent, gameContent } from 'virtual:content';
import {
  type CivilDate,
  type Content,
  DAILY_EPOCH,
  type DayCtx,
  dailyNumber,
  dailySeed,
  type ShiftAction,
  type ShiftEvent,
  type ShiftState,
  shareMarks,
  shareText,
  shiftScore,
  startShift,
  stepShift,
  type Verdict,
} from '@cots/engine';
import { type KeyValueStore, memoryStore, requestPersistence, type ShareResult } from '@cots/platform';
import { platform } from '@platform';
import { batch, signal } from '@preact/signals';
import { t } from './i18n';
import { type LayoutMode, layoutMode } from './layout';

/*
 * App state. The engine's shift is pure; this module owns time (a monotonic
 * clock), persistence and the transient UI around it. Components read the
 * signals and call the functions below.
 */

// ---------- clock ----------

let clockOffset = 0;
/** Monotonic integer ms. Continues across a reload when an in-progress Daily is resumed. */
export const clock = (): number => Math.round(performance.now()) + clockOffset;
/** Updated four times a second while a shift runs; the sun display reads it. */
export const now = signal(0);

// ---------- settings ----------

export interface Settings {
  readonly v: 1;
  readonly layout: 'auto' | LayoutMode;
  readonly textScale: number;
  readonly holdToSend: boolean;
  readonly untimedPractice: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  v: 1,
  layout: 'auto',
  textScale: 1,
  holdToSend: true,
  untimedPractice: false,
};

export const settings = signal<Settings>(DEFAULT_SETTINGS);

export function effectiveLayout(): LayoutMode {
  const s = settings.value.layout;
  return s === 'auto' ? layoutMode.value : s;
}

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
  applySettings();
  void store?.set('settings', settings.value);
}

function applySettings(): void {
  document.documentElement.style.fontSize = `${Math.round(settings.value.textScale * 100)}%`;
}

// ---------- Daily records ----------

export interface DailyResult {
  readonly n: number;
  readonly g: number;
  readonly correct: number;
  readonly total: number;
  readonly spareMs: number;
  readonly endedBy: 'queue' | 'dusk';
  readonly marks: string;
}

export interface DailyRecord {
  readonly v: 1;
  readonly results: Readonly<Record<string, DailyResult>>;
}

/** The Daily being played, saved after every action so a reload can't reroll or rewind it. */
export interface DailyProgress {
  readonly v: 1;
  readonly n: number;
  readonly g: number;
  readonly actions: readonly ShiftAction[];
}

export const dailyRecord = signal<DailyRecord>({ v: 1, results: {} });
export const dailyProgress = signal<DailyProgress | null>(null);
export const storageReady = signal(false);

let store: KeyValueStore | null = null;

export async function initStorage(): Promise<void> {
  try {
    store = await platform.openStore();
  } catch {
    store = memoryStore();
  }
  const [s, record, progress] = await Promise.all([
    store.get<Settings>('settings'),
    store.get<DailyRecord>('daily'),
    store.get<DailyProgress>('daily-progress'),
  ]);
  batch(() => {
    if (s?.v === 1) settings.value = { ...DEFAULT_SETTINGS, ...s };
    if (record?.v === 1) dailyRecord.value = record;
    if (progress?.v === 1) dailyProgress.value = progress;
    storageReady.value = true;
  });
  applySettings();
}

export function todayLocal(): CivilDate {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

export const isoDate = ({ year, month, day }: CivilDate): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export const epochText = (): string => isoDate(DAILY_EPOCH);

export interface Streak {
  readonly current: number;
  readonly best: number;
}

/** Consecutive Dailies played to the end, up to today (or yesterday, if today isn't played yet). */
export function streakOf(record: DailyRecord, today: number): Streak {
  const played = new Set(Object.values(record.results).map((r) => r.n));
  let current = 0;
  for (let k = played.has(today) ? today : today - 1; played.has(k); k--) current++;
  const sorted = [...played].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  sorted.forEach((n, i) => {
    run = i > 0 && sorted[i - 1] === n - 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return { current, best };
}

// ---------- the shift session ----------

export type Mode =
  | {
      readonly kind: 'daily';
      readonly n: number;
      readonly date: string;
      readonly preview: boolean;
      readonly ranked: boolean;
    }
  | { readonly kind: 'practice'; readonly day: number };

export interface Session {
  readonly mode: Mode;
  readonly content: Content;
  readonly ctx: DayCtx;
  readonly state: ShiftState;
  readonly actions: readonly ShiftAction[];
}

export type Screen = 'title' | 'briefing' | 'shift' | 'summary';

export const screen = signal<Screen>('title');
export const session = signal<Session | null>(null);

// Transient UI around the current soul.
export interface Toast {
  readonly id: number;
  readonly text: string;
  readonly tone: 'good' | 'bad' | 'info';
}
export const toast = signal<Toast | null>(null);
export const answer = signal<{ readonly name: string; readonly lines: readonly string[] } | null>(null);
export const citation = signal<Verdict | null>(null);
export const comparing = signal(false);
export const compareFirst = signal<string | null>(null);
export const drawerTab = signal<'words' | 'ravens' | 'rules'>('words');
export const stampSheet = signal(false);

let toastId = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function say(text: string, tone: Toast['tone'] = 'info'): void {
  toast.value = { id: ++toastId, text, tone };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = null;
  }, 2600);
}

export function resetSoulUi(): void {
  batch(() => {
    comparing.value = false;
    compareFirst.value = null;
    stampSheet.value = false;
    drawerTab.value = 'words';
  });
}

type ActionInput = ShiftAction extends infer A ? (A extends ShiftAction ? Omit<A, 'at'> : never) : never;

/** Steps the shift with the current time and reacts to what happened. */
export function act(input: ActionInput): void {
  const s = session.peek();
  if (!s) return;
  const action = { ...input, at: clock() } as ShiftAction;
  const r = stepShift(s.state, action, s.ctx);
  if (r.state === s.state && r.events.length === 0) return;
  const changed = r.state !== s.state;
  const next: Session = { ...s, state: r.state, actions: changed ? [...s.actions, action] : s.actions };
  batch(() => {
    session.value = next;
    for (const e of r.events) onEvent(e, next);
  });
  if (changed) saveProgress(next);
}

function onEvent(e: ShiftEvent, s: Session): void {
  const cases = s.state.cases;
  switch (e.e) {
    case 'contradiction':
      say(t('ui.compare.found'), 'good');
      comparing.value = false;
      compareFirst.value = null;
      break;
    case 'noConflict':
      say(t('ui.compare.none', { s: e.penaltyMs / 1000 }), 'bad');
      comparing.value = false;
      compareFirst.value = null;
      break;
    case 'answer': {
      const c = cases[s.state.cursor];
      answer.value = {
        name: c?.evidence.look.name ?? '',
        lines: e.response.lines.map((l) => t(l.msg, l.params)),
      };
      break;
    }
    case 'judged': {
      const dest = t(`dest.${e.verdict.stamped}`);
      say(t(e.verdict.correct ? 'ui.verdict.right' : 'ui.verdict.wrong', { dest }), e.verdict.correct ? 'good' : 'bad');
      resetSoulUi();
      break;
    }
    case 'citation':
      if (s.state.phase !== 'done') citation.value = e.verdict;
      break;
    case 'dusk':
      say(t('ui.dusk'), 'bad');
      break;
    case 'done':
      finish(s);
      break;
    case 'rejected':
      say(e.reason, 'info');
      break;
    default:
      break;
  }
}

function saveProgress(s: Session): void {
  if (s.mode.kind !== 'daily' || !s.mode.ranked || s.state.phase === 'done') return;
  const progress: DailyProgress = { v: 1, n: s.mode.n, g: s.content.genVersion, actions: s.actions };
  dailyProgress.value = progress;
  void store?.set('daily-progress', progress);
}

function finish(s: Session): void {
  citation.value = null;
  answer.value = null;
  if (s.mode.kind === 'daily' && s.mode.ranked) {
    const score = shiftScore(s.state);
    const result: DailyResult = {
      n: s.mode.n,
      g: s.content.genVersion,
      correct: score.correct,
      total: score.total,
      spareMs: score.spareMs,
      endedBy: s.state.endedBy ?? 'queue',
      marks: shareMarks(s.state),
    };
    dailyRecord.value = { v: 1, results: { ...dailyRecord.value.results, [String(s.mode.n)]: result } };
    dailyProgress.value = null;
    void store?.set('daily', dailyRecord.value);
    void store?.remove('daily-progress');
    void requestPersistence();
  }
  screen.value = 'summary';
}

/** Today's Daily. Before DAILY_EPOCH it's an unnumbered preview so testers can play now. */
export function today(): { n: number; date: string; preview: boolean } {
  const date = todayLocal();
  const n = dailyNumber(date);
  return { n, date: isoDate(date), preview: n < 1 };
}

export function startDaily(): void {
  const content = dailyContent;
  if (!content?.daily) return;
  const { n, date, preview } = today();
  const ranked = !dailyRecord.value.results[String(n)];
  const { state, ctx } = startShift(content, {
    mode: 'daily',
    seed: dailySeed(n),
    day: content.daily.day,
    dailyNumber: n,
  });
  let s: Session = { mode: { kind: 'daily', n, date, preview, ranked }, content, ctx, state, actions: [] };

  const progress = dailyProgress.value;
  if (ranked && progress && progress.n === n && progress.g === content.genVersion && progress.actions.length > 0) {
    // Replay the saved actions, then carry on the same timeline, paused.
    let st = s.state;
    for (const a of progress.actions) st = stepShift(st, a, ctx).state;
    const lastAt = progress.actions[progress.actions.length - 1]?.at ?? 0;
    clockOffset = lastAt - Math.round(performance.now());
    const actions = [...progress.actions];
    if (st.phase === 'shift' && st.clock.pausedAt === null) {
      const pause: ShiftAction = { t: 'pause', at: lastAt };
      st = stepShift(st, pause, ctx).state;
      actions.push(pause);
    }
    s = { ...s, state: st, actions };
  }
  resetSoulUi();
  session.value = s;
  screen.value = s.state.phase === 'briefing' ? 'briefing' : s.state.phase === 'shift' ? 'shift' : 'summary';
}

export function startPractice(day: number): void {
  // Practice seeds are random on purpose; only the engine has to be deterministic.
  const seed = `practice:${Date.now().toString(36)}:${Math.floor(Math.random() * 1e9).toString(36)}`;
  const { state, ctx } = startShift(gameContent, {
    mode: 'practice',
    seed,
    day,
    untimed: settings.value.untimedPractice,
  });
  resetSoulUi();
  session.value = { mode: { kind: 'practice', day }, content: gameContent, ctx, state, actions: [] };
  screen.value = 'briefing';
}

export function begin(): void {
  act({ t: 'begin' });
  if (session.value?.state.phase === 'shift') screen.value = 'shift';
}

export function toTitle(): void {
  batch(() => {
    session.value = null;
    citation.value = null;
    answer.value = null;
    screen.value = 'title';
  });
}

/** Spoiler-free result text, and the link it points to. */
export function shareBody(s: Session): { text: string; url: string | undefined } {
  const label = s.mode.kind === 'daily' && s.mode.preview ? `Daily preview ${s.mode.date}` : undefined;
  const text = shareText(s.state, s.content, { title: t('core.title'), ...(label ? { label } : {}) });
  return { text, url: platform.shareUrl() };
}

export async function shareResult(s: Session): Promise<ShareResult> {
  const { text, url } = shareBody(s);
  return platform.share(text, url);
}

// ---------- time and pausing ----------

let ticker: ReturnType<typeof setInterval> | undefined;

function pauseIfPlaying(): void {
  const s = session.peek();
  if (s && screen.peek() === 'shift' && s.state.phase === 'shift' && s.state.clock.pausedAt === null) {
    act({ t: 'pause' });
  }
}

/** Starts the sun ticker and the auto-pause listeners. Call once. */
export function startClock(): void {
  if (ticker) return;
  ticker = setInterval(() => {
    now.value = clock();
    const s = session.peek();
    if (s?.state.phase === 'shift' && s.state.clock.pausedAt === null) act({ t: 'tick' });
  }, 250);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pauseIfPlaying();
  });
  window.addEventListener('pagehide', pauseIfPlaying);
  window.addEventListener('blur', pauseIfPlaying);
}
