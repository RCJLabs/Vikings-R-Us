import { dailyChecks, dailyContent, gameContent, manifest } from 'virtual:content';
import {
  type CivilDate,
  type Content,
  DAILY_EPOCH,
  type DayCtx,
  dailyNumber,
  dailySeed,
  expectedChecksum,
  type GuardResult,
  guardDaily,
  queueChecksum,
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
import { links } from './links';
import { sendGuard, sendShift } from './telemetry';
import { type BuildInfo, shiftRecord } from './telemetry-payload';

/*
 * App state. The engine's shift is pure; this module owns time (a monotonic
 * clock), persistence and the transient UI around it. Components read the
 * signals and call the functions below.
 */

// ---------- clock ----------

let clockOffset = 0;
/** Monotonic integer ms. Continues across a reload when an in-progress Daily is resumed. */
export const clock = (): number => Math.round(performance.now()) + clockOffset;
/** Makes the clock read at least `at` from now on, so a resumed shift carries on its own timeline. */
export function resumeClockAt(at: number): void {
  if (clock() < at) clockOffset = at - Math.round(performance.now());
}
/** Updated four times a second while a shift runs; the sun display reads it. */
export const now = signal(0);

// ---------- settings ----------

export interface Settings {
  readonly v: 1;
  readonly layout: 'auto' | LayoutMode;
  readonly textScale: number;
  readonly holdToSend: boolean;
  readonly untimedPractice: boolean;
  /** Opt-in alpha telemetry. Off until the player says yes. */
  readonly telemetry: boolean;
  /** Whether the one-time telemetry question has been answered. */
  readonly telemetryAsked: boolean;
  readonly primerDone: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  v: 1,
  layout: 'auto',
  textScale: 1,
  holdToSend: true,
  untimedPractice: false,
  telemetry: false,
  telemetryAsked: false,
  primerDone: false,
};

export const settings = signal<Settings>(DEFAULT_SETTINGS);

export function effectiveLayout(): LayoutMode {
  const s = settings.value.layout;
  return s === 'auto' ? layoutMode.value : s;
}

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
  applySettings();
  mirror(MIRROR.settings, settings.value);
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
  /** Whether this device's Daily matched the build's checksum table. */
  readonly guard?: GuardResult;
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
  /** Clock time last seen with the sun running (a 5 s heartbeat), so a reload refunds at most that. */
  readonly seenAt?: number;
}

export const dailyRecord = signal<DailyRecord>({ v: 1, results: {} });
export const dailyProgress = signal<DailyProgress | null>(null);
export const storageReady = signal(false);

let store: KeyValueStore | null = null;

/*
 * Daily progress and results are also mirrored to localStorage, which writes
 * synchronously. An IndexedDB write still in flight is lost if the page
 * unloads, and losing a just-sent soul or a finished result would let the
 * Daily be played again.
 */
const MIRROR = { progress: 'cots.daily-progress', record: 'cots.daily', settings: 'cots.settings' } as const;

export function mirror(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: IndexedDB still has it.
  }
}

export function readMirror<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function mergeRecords(a: DailyRecord | undefined, b: DailyRecord | undefined): DailyRecord {
  return { v: 1, results: { ...(a?.v === 1 ? a.results : {}), ...(b?.v === 1 ? b.results : {}) } };
}

/** The fuller of two saves of the same Daily (or the later Daily). */
function newest(a: DailyProgress | undefined, b: DailyProgress | undefined): DailyProgress | undefined {
  if (a?.v !== 1) return b?.v === 1 ? b : undefined;
  if (b?.v !== 1) return a;
  if (a.n !== b.n) return a.n > b.n ? a : b;
  return b.actions.length > a.actions.length || (b.seenAt ?? 0) > (a.seenAt ?? 0) ? b : a;
}

/** The key-value store, once initStorage has opened it. */
export const kvStore = (): KeyValueStore | null => store;

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
    // The synchronous copy is never older than IndexedDB's.
    const saved = readMirror<Settings>(MIRROR.settings) ?? s;
    if (saved?.v === 1) settings.value = { ...DEFAULT_SETTINGS, ...saved };
    dailyRecord.value = mergeRecords(record, readMirror<DailyRecord>(MIRROR.record));
    dailyProgress.value = newest(progress, readMirror<DailyProgress>(MIRROR.progress)) ?? null;
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
      /** This device's checksum for the Daily, and whether it matched the build's table. */
      readonly checksum: string;
      readonly guard: GuardResult;
    }
  | { readonly kind: 'practice'; readonly day: number }
  | { readonly kind: 'primer' }
  | { readonly kind: 'campaign'; readonly day: number; readonly story: boolean };

export interface Session {
  readonly mode: Mode;
  readonly content: Content;
  readonly ctx: DayCtx;
  /** The shift as generated, before any action (traces replay from it). */
  readonly initial: ShiftState;
  readonly state: ShiftState;
  readonly actions: readonly ShiftAction[];
  /** Steps the shift instead of stepShift: a campaign steps its whole run (campaign/run-store.ts). */
  readonly step?: (
    state: ShiftState,
    action: ShiftAction,
  ) => {
    readonly state: ShiftState;
    readonly events: readonly ShiftEvent[];
  };
  /** Called every few seconds while the sun runs, to save how far it got. */
  readonly heartbeat?: () => void;
}

/** What telemetry and reports say about this build. */
export function buildInfo(content: Content): BuildInfo {
  return { target: manifest.target, content: manifest.contentHash, g: content.genVersion };
}

/**
 * The telemetry endpoint, if this build may use one. Only the web and itch
 * builds (the alpha) ever send; the Steam and Play builds ignore the setting,
 * matching the privacy note and Play's "no data collected".
 */
export const telemetryBase = (): string | undefined =>
  platform.kind === 'web' || platform.kind === 'itch' ? links.telemetry : undefined;

export const telemetryAvailable = (): boolean => telemetryBase() !== undefined;

export type Screen = 'title' | 'briefing' | 'shift' | 'summary' | 'campaign' | 'morning' | 'audit' | 'night' | 'ending';

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
export const drawerTab = signal<'words' | 'ravens' | 'registry' | 'rules'>('words');
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
  const r = s.step ? s.step(s.state, action) : stepShift(s.state, action, s.ctx);
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
  const progress: DailyProgress = {
    v: 1,
    n: s.mode.n,
    g: s.content.genVersion,
    actions: s.actions,
    seenAt: clock(),
  };
  dailyProgress.value = progress;
  mirror(MIRROR.progress, progress);
  void store?.set('daily-progress', progress);
}

function finish(s: Session): void {
  citation.value = null;
  answer.value = null;
  // The run has already audited the shift; the campaign's own screens take over.
  if (s.mode.kind === 'campaign') {
    screen.value = 'audit';
    return;
  }
  const telemetry = telemetryBase();
  if (telemetry && settings.peek().telemetry) {
    sendShift(
      telemetry,
      shiftRecord({
        build: buildInfo(s.content),
        mode: s.mode.kind,
        ...(s.mode.kind === 'daily' ? { n: s.mode.n, guard: s.mode.guard } : {}),
        layout: effectiveLayout(),
        initial: s.initial,
        actions: s.actions,
        ctx: s.ctx,
      }),
    );
  }
  if (s.mode.kind === 'primer' && !settings.peek().primerDone) updateSettings({ primerDone: true });
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
      guard: s.mode.guard,
    };
    dailyRecord.value = { v: 1, results: { ...dailyRecord.value.results, [String(s.mode.n)]: result } };
    dailyProgress.value = null;
    // Result first, then drop the progress: an unload between the two must not lose both.
    mirror(MIRROR.record, dailyRecord.value);
    mirror(MIRROR.progress, null);
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
  // The checksum guard: does this device generate the Daily everyone else gets?
  const checksum = queueChecksum(state.cases, ctx);
  const guard = guardDaily(dailyChecks, n, content.genVersion, checksum);
  const telemetry = telemetryBase();
  if (guard === 'mismatch' && telemetry && settings.peek().telemetry) {
    sendGuard(telemetry, {
      v: 1,
      build: buildInfo(content),
      n,
      expected: expectedChecksum(dailyChecks, n, content.genVersion) ?? '',
      got: checksum,
      ua: navigator.userAgent.slice(0, 400),
    });
  }
  let s: Session = {
    mode: { kind: 'daily', n, date, preview, ranked, checksum, guard },
    content,
    ctx,
    initial: state,
    state,
    actions: [],
  };

  const progress = dailyProgress.value;
  if (ranked && progress && progress.n === n && progress.g === content.genVersion && progress.actions.length > 0) {
    // Replay the saved actions, then carry on the same timeline, paused.
    let st = s.state;
    for (const a of progress.actions) st = stepShift(st, a, ctx).state;
    const lastAt = progress.actions[progress.actions.length - 1]?.at ?? 0;
    // The sun ran at least until the last heartbeat; the unload's own pause may not have been saved.
    const resumeAt = Math.max(lastAt, progress.seenAt ?? 0);
    clockOffset = resumeAt - Math.round(performance.now());
    const actions = [...progress.actions];
    if (st.phase === 'shift' && st.clock.pausedAt === null) {
      const pause: ShiftAction = { t: 'pause', at: resumeAt };
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
  session.value = { mode: { kind: 'practice', day }, content: gameContent, ctx, initial: state, state, actions: [] };
  screen.value = 'briefing';
}

/** The fixed seed that gives everyone the same primer. */
export const PRIMER_SEED = 'primer';

export function startPrimer(): void {
  const content = dailyContent;
  if (!content?.primer) return;
  const { state, ctx } = startShift(content, {
    mode: 'primer',
    seed: PRIMER_SEED,
    day: content.primer.day,
    untimed: true,
  });
  resetSoulUi();
  coachAcks.value = [];
  session.value = { mode: { kind: 'primer' }, content, ctx, initial: state, state, actions: [] };
  screen.value = 'briefing';
}

/** Coach steps the player has clicked past ("Next"). */
export const coachAcks = signal<readonly string[]>([]);

export function begin(): void {
  act({ t: 'begin' });
  if (session.value?.state.phase === 'shift') screen.value = 'shift';
}

/** Leaves a campaign shift for the save slots. The run is already saved, paused. */
export function quitToSlots(): void {
  batch(() => {
    session.value = null;
    citation.value = null;
    answer.value = null;
    screen.value = 'campaign';
  });
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
  let label: string | undefined;
  if (s.mode.kind === 'daily') {
    label = s.mode.preview ? `Daily preview ${s.mode.date}` : `Daily #${s.mode.n}`;
    // A device that built a different Daily says so, so nobody compares apples with pears.
    if (s.mode.guard === 'mismatch') label += ' · unverified';
  }
  const text = shareText(s.state, s.content, { title: t('core.title'), ...(label ? { label } : {}) });
  return { text, url: platform.shareUrl() };
}

// ---------- updates ----------

/** True when a new version is downloaded and waiting (the title screen offers it). */
export const updateReady = signal(false);
let installUpdate: (() => Promise<void>) | null = null;

export function applyUpdate(): void {
  void installUpdate?.();
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

/** Starts the sun ticker, the auto-pause listeners and the update watch. Call once. */
export function startClock(): void {
  if (ticker) return;
  installUpdate = platform.watchForUpdate(() => {
    updateReady.value = true;
  });
  let beats = 0;
  ticker = setInterval(() => {
    now.value = clock();
    const s = session.peek();
    if (s?.state.phase === 'shift' && s.state.clock.pausedAt === null) {
      act({ t: 'tick' });
      if (++beats % 20 === 0) {
        const current = session.peek() ?? s;
        saveProgress(current);
        current.heartbeat?.();
      }
    }
  }, 250);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pauseIfPlaying();
  });
  window.addEventListener('pagehide', pauseIfPlaying);
  window.addEventListener('blur', pauseIfPlaying);
}
