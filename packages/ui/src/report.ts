import { type GuardResult, queueChecksum, type ShiftAction, traceShift } from '@cots/engine';
import { signal } from '@preact/signals';
import { issueFormUrl } from './links';
import { buildInfo, effectiveLayout, type Mode, type Session } from './store';
import type { BuildInfo } from './telemetry-payload';

/**
 * "Report this soul" (docs/tech-spec.md §3.10): enough to rebuild the case
 * exactly (build, mode, seed, index) plus what the player did with it, so the
 * Case Lab can check a judgment someone thinks is unfair.
 */
export interface SoulReport {
  readonly v: 1;
  readonly build: BuildInfo;
  readonly mode: Mode['kind'];
  readonly n?: number;
  readonly seed: string;
  readonly day: number;
  readonly soul: number;
  readonly case: string;
  /** Checksum of the whole queue, to spot a device that built a different shift. */
  readonly queue: string;
  readonly guard?: GuardResult;
  readonly verdict: {
    readonly stamped: string | null;
    readonly expected: string;
    readonly rule: string;
    readonly missed: readonly string[];
  } | null;
  /** This soul's actions, with times in ms since its first one. */
  readonly actions: readonly ShiftAction[];
  readonly device: {
    readonly ua: string;
    readonly w: number;
    readonly h: number;
    readonly dpr: number;
    readonly layout: string;
    readonly lang: string;
  };
}

export function soulReport(s: Session, index: number): SoulReport {
  const { souls } = traceShift(s.initial, s.actions, s.ctx);
  const trace = souls[index];
  const c = s.state.cases[index];
  const first = trace?.actions[0]?.at ?? 0;
  const v = trace?.verdict ?? null;
  return {
    v: 1,
    build: buildInfo(s.content),
    mode: s.mode.kind,
    ...(s.mode.kind === 'daily' ? { n: s.mode.n, guard: s.mode.guard } : {}),
    seed: s.state.config.seed,
    day: s.ctx.day,
    soul: index,
    case: c?.id ?? '',
    queue: queueChecksum(s.state.cases, s.ctx),
    verdict: v ? { stamped: v.stamped, expected: v.expected, rule: v.rule, missed: v.missed } : null,
    actions: (trace?.actions ?? []).map((a) => ({ ...a, at: a.at - first })),
    device: {
      ua: navigator.userAgent,
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio,
      layout: effectiveLayout(),
      lang: navigator.language,
    },
  };
}

export function reportTitle(r: SoulReport): string {
  const what = r.mode === 'daily' ? `Daily #${r.n}` : r.mode === 'primer' ? 'Primer' : `Day ${r.day} practice`;
  return `Soul report: ${what}, soul ${r.soul + 1}`;
}

/** The report form on GitHub with the report filled in, if this build has an issues link. */
export function reportUrl(r: SoulReport): string | undefined {
  return issueFormUrl('soul-report.yml', { report: JSON.stringify(r) }, reportTitle(r));
}

/** The report being shown, if any. */
export const reportFor = signal<SoulReport | null>(null);

export function openReport(s: Session, index: number): void {
  reportFor.value = soulReport(s, index);
}
