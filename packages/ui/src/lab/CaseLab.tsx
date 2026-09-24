import { dailyContent, gameContent } from 'virtual:content';
import {
  type CaseSpec,
  type Content,
  createDayContext,
  type DayCtx,
  type Destination,
  type Field,
  generateCase,
  generateCaseAt,
  planDay,
  questionResponse,
  revealsOf,
  type SoulState,
  solve,
} from '@cots/engine';
import { useMemo, useState } from 'preact/hooks';
import { art } from '../art';
import { t } from '../i18n';
import { sceneFor } from '../shift/evidence';

/**
 * Case Lab v1 (text only), dev-full builds only. The leak check requires this
 * marker in dev-full and forbids it everywhere else.
 */
export const CASE_LAB_MARKER = 'cots-case-lab';

/** Draws the body as the player sees it, with the feather's reading showing. */
const FRESH_SOUL: SoulState = {
  seen: [],
  view: 'front',
  flipped: false,
  tools: [],
  flagged: [],
  questioned: [],
  stamp: null,
};

const describeField = (f: Field, c: CaseSpec): string => {
  if (f.obs) return `${f.obs.key} = ${String(f.obs.value)}`;
  if (f.cue) return `cue: ${f.cue.key}${c.meta.decoys.includes(f.id) ? ' (decoy)' : ''}`;
  return f.text ? t(f.text.msg, f.text.params) : '';
};

interface SweepRow {
  attempts: number;
  accepted: number;
}

/** A small in-browser sweep for one day (the full one is `pnpm sim sweep`). */
function labSweep(day: number, seeds: number) {
  const perArchetype: Record<string, SweepRow> = {};
  const dests: Partial<Record<Destination, number>> = {};
  let souls = 0;
  let attempts = 0;
  let fallbacks = 0;
  let trusting = 0;
  for (let s = 0; s < seeds; s++) {
    const seed = `lab-sweep-${s}`;
    const ctx = createDayContext(gameContent, day, seed);
    const plan = planDay(seed, ctx);
    plan.targets.forEach((target, i) => {
      const g = generateCase(seed, ctx, i, target, i === 0 && plan.teach ? { teach: plan.teach } : {});
      souls++;
      attempts += g.log.attempts.length;
      if (g.log.fallback) fallbacks++;
      for (const a of g.log.attempts) {
        if (!a.archetype) continue;
        const row = perArchetype[a.archetype] ?? { attempts: 0, accepted: 0 };
        row.attempts++;
        if (a.code === 'ACCEPTED') row.accepted++;
        perArchetype[a.archetype] = row;
      }
      dests[g.case.expect.dest] = (dests[g.case.expect.dest] ?? 0) + 1;
      const tj = solve(g.case.evidence.fields, ctx, { trustTestimony: true }).judgment;
      if (tj.kind === 'determined' && tj.dest === g.case.expect.dest) trusting++;
    });
  }
  return { souls, attempts, fallbacks, trusting, perArchetype, dests };
}

const pct = (a: number, b: number) => (b ? `${Math.round((a * 100) / b)}%` : '–');

/** A campaign day, or the Daily or primer specs (which play with core + daily content). */
type Source = number | 'daily' | 'primer';

function contextFor(source: Source, seed: string): { ctx: DayCtx; content: Content } {
  if (typeof source === 'number') return { ctx: createDayContext(gameContent, source, seed), content: gameContent };
  const spec = source === 'daily' ? dailyContent?.daily : dailyContent?.primer;
  if (!dailyContent || !spec) throw new Error(`This build has no ${source}`);
  return { ctx: createDayContext(dailyContent, spec.day, seed, spec), content: dailyContent };
}

/** A pasted "Report this soul" JSON: where to jump, and what the player did. */
interface LoadedReport {
  readonly mode: string;
  readonly seed: string;
  readonly day: number;
  readonly soul: number;
  /** `seed:day:position` for a generated soul, `seed:day:<story soul id>` for a story soul. */
  readonly case?: string;
  readonly verdict: unknown;
  readonly actions: unknown;
}

export function CaseLab() {
  const days = gameContent.days.map((d) => d.day);
  const [seed, setSeed] = useState('lab');
  const [source, setSource] = useState<Source>(days[0] ?? 1);
  const day = typeof source === 'number' ? source : (days[0] ?? 1);
  const [index, setIndex] = useState(0);
  const [sweep, setSweep] = useState<ReturnType<typeof labSweep> | null>(null);
  const [report, setReport] = useState<LoadedReport | null>(null);
  const [reportError, setReportError] = useState('');

  const loadReport = (text: string) => {
    try {
      const r = JSON.parse(text) as LoadedReport;
      if (typeof r.seed !== 'string' || typeof r.soul !== 'number') throw new Error('not a soul report');
      setSource(r.mode === 'daily' || r.mode === 'primer' ? r.mode : r.day);
      setSeed(r.seed);
      // A campaign queue can hold story souls, so its position in the queue isn't the generated one.
      const tail = r.case?.split(':').pop();
      setIndex(tail !== undefined && /^\d+$/.test(tail) ? Number(tail) : r.soul);
      setReport(r);
      setReportError('');
    } catch (e) {
      setReportError((e as Error).message);
    }
  };

  const { ctx, content } = useMemo(() => contextFor(source, seed), [source, seed]);
  const plan = useMemo(() => planDay(seed, ctx), [ctx, seed]);
  const i = Math.min(index, plan.count - 1);
  const { case: c, log } = useMemo(() => generateCaseAt(seed, ctx, i), [ctx, seed, i]);
  const solved = useMemo(() => solve(c.evidence.fields, ctx, { reveals: revealsOf(c.lies) }), [c, ctx]);

  if (days.length === 0) return <section class="lab">No days in this build.</section>;

  return (
    <section class="lab" data-marker={CASE_LAB_MARKER}>
      <h2>Case Lab</h2>
      <div class="lab__controls">
        <label>
          Seed <input value={seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value || 'lab')} />
        </label>
        <label>
          Day{' '}
          <select
            value={String(source)}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              setSource(v === 'daily' || v === 'primer' ? v : Number(v));
            }}
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
            {dailyContent?.daily ? <option value="daily">Daily</option> : null}
            {dailyContent?.primer ? <option value="primer">Primer</option> : null}
          </select>
        </label>
        <button type="button" onClick={() => setIndex(Math.max(0, i - 1))} disabled={i === 0}>
          ◀
        </button>
        <span>
          soul {i + 1}/{plan.count}
        </span>
        <button type="button" onClick={() => setIndex(Math.min(plan.count - 1, i + 1))} disabled={i >= plan.count - 1}>
          ▶
        </button>
      </div>

      <details>
        <summary>Load a soul report</summary>
        <textarea
          rows={4}
          placeholder="Paste the JSON from “Report this soul”"
          onChange={(e) => loadReport((e.target as HTMLTextAreaElement).value)}
        />
        {reportError ? <p>Couldn't read it: {reportError}</p> : null}
        {report?.case && !/:\d+$/.test(report.case) ? (
          <p>This is story soul {report.case.split(':').pop()}; the lab shows generated souls only.</p>
        ) : null}
        {report ? (
          <pre class="lab__report">{JSON.stringify({ verdict: report.verdict, actions: report.actions }, null, 1)}</pre>
        ) : null}
      </details>

      <p>{t(ctx.spec.decree)}</p>
      {Object.values(ctx.paramChoices).map((p) => (
        <p key={p.id}>{t(p.text)}</p>
      ))}
      <p class="lab__queue">
        {plan.targets.map((d, k) => (
          <button type="button" key={`${k}-${d}`} class={k === i ? 'is-current' : ''} onClick={() => setIndex(k)}>
            {d}
          </button>
        ))}
      </p>

      <h3>
        {c.evidence.look.name} {c.evidence.look.patronym} → {c.expect.dest}
      </h3>
      <p>
        {c.archetype} · {c.evidence.persona} · rule {c.expect.rule} · difficulty {c.meta.difficulty} · proof{' '}
        {c.meta.proofCostS}s · {c.meta.tier} tier, {c.meta.attempts} attempt(s){c.meta.fallback ? ' · FALLBACK' : ''}
      </p>

      <div class="lab__bodies">
        {(['front', 'back'] as const).map((view) => (
          <div
            key={view}
            class="lab__body"
            dangerouslySetInnerHTML={{
              __html: art.value.draw({ ...sceneFor(c, { ...FRESH_SOUL, view }), tools: ['feather'] }),
            }}
          />
        ))}
      </div>

      <h4>Truth</h4>
      <table>
        <tbody>
          {Object.entries(c.truth).map(([k, v]) => (
            <tr key={k}>
              <td>
                {k}
                {c.meta.decisive.includes(k) ? ' *' : ''}
              </td>
              <td>{String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Evidence</h4>
      <table>
        <tbody>
          {c.evidence.fields.map((f) => {
            const lie = c.lies.find((l) => l.field === f.id);
            return (
              <tr key={f.id} class={c.meta.proof.includes(f.id) ? 'is-proof' : ''}>
                <td>{f.id}</td>
                <td>{describeField(f, c)}</td>
                <td>{lie ? `LIE: really ${String(lie.truth)} (${lie.onQuestion})` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h4>Solver</h4>
      <p>
        {solved.judgment.kind === 'determined'
          ? `${solved.judgment.dest} by ${solved.judgment.rule}`
          : `UNDETERMINED at ${solved.judgment.rule}: ${solved.judgment.blocking.join(', ')}`}
      </p>
      <table>
        <tbody>
          {[...solved.beliefs].map(([fact, b]) => (
            <tr key={fact}>
              <td>{fact}</td>
              <td>{b.values.map(String).join(' | ')}</td>
              <td>level {b.level}</td>
              <td>{b.support.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Rules:{' '}
        {solved.rules.map((r) => (
          <span key={r.rule} class="lab__rule">
            {r.rule} {r.result}
          </span>
        ))}
      </p>

      <h4>Contradictions and questions</h4>
      {solved.contradictions.length === 0 ? <p>None.</p> : null}
      {solved.contradictions.map((x) => {
        const q = questionResponse(c, x.lie, content);
        return (
          <p key={x.lie}>
            {x.lie} ({x.fact}) vs {x.against.join(' + ')} → {q?.kind}: “
            {q?.lines.map((l) => t(l.msg, l.params)).join(' ')}”
          </p>
        );
      })}

      <h4>Generation log</h4>
      <ol>
        {log.attempts.map((a) => (
          <li key={`${a.tier}-${a.attempt}`}>
            {a.tier}/{a.attempt} {a.archetype ?? '–'}: {a.code}
            {a.detail ? ` (${a.detail})` : ''}
          </li>
        ))}
      </ol>

      <h4>Sweep</h4>
      <button type="button" disabled={typeof source !== 'number'} onClick={() => setSweep(labSweep(day, 100))}>
        Sweep 100 seeds of day {day}
      </button>
      {sweep ? (
        <div>
          <p>
            {sweep.souls} souls · mean attempts {(sweep.attempts / sweep.souls).toFixed(2)} · fallbacks{' '}
            {sweep.fallbacks} · trusting bot {pct(sweep.trusting, sweep.souls)}
          </p>
          <p>
            {Object.entries(sweep.dests)
              .map(([d, n]) => `${d} ${pct(n ?? 0, sweep.souls)}`)
              .join(' · ')}
          </p>
          <table>
            <tbody>
              {Object.entries(sweep.perArchetype).map(([a, row]) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td>{pct(row.accepted, row.attempts)} accepted</td>
                  <td>{row.attempts} attempts</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
