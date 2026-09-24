import type { Hotspot } from '@cots/art';
import {
  type CaseSpec,
  currentCase,
  ENDLESS_STRIKES,
  type Field,
  type Lesson,
  nextHint,
  PENALTY,
  questionCostMs,
  ruledOut,
  ruleText,
  stampsFor,
  sunLeft,
  type Verdict,
} from '@cots/engine';
import { copyText } from '@cots/platform';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { art, usePixelFrame } from '../art';
import { clockText, listText, t } from '../i18n';
import { openReport, reportFor, reportTitle, reportUrl, type SoulReport } from '../report';
import {
  act,
  answer,
  citation,
  clock,
  coachAcks,
  coachState,
  compareFirst,
  comparing,
  drawerTab,
  effectiveLayout,
  noteCoached,
  now,
  quitToSlots,
  type Session,
  session,
  settings,
  stampSheet,
  toast,
  toTitle,
  updateSettings,
} from '../store';
import { activeLesson, coachStep } from './coach';
import { fieldText, regionFields, regionSeen, registryEntry, sceneFor, skippedText } from './evidence';
import { hintsAllowed, pendingHintFocus } from './hint';
import { RulesPanel } from './Rules';

/** Focuses an element once, when it mounts (dialogs, the briefing's Begin button). */
export function useAutoFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  // Layout effect: focus lands before the next key press can.
  useLayoutEffect(() => ref.current?.focus(), []);
  return ref;
}

// ---------- compare ----------

/** Picks an item for Compare; the second pick runs the comparison. */
export function pick(id: string): void {
  const first = compareFirst.peek();
  if (!comparing.peek() || first === null) {
    comparing.value = true;
    compareFirst.value = id;
  } else if (first === id) {
    compareFirst.value = null;
  } else {
    act({ t: 'compare', a: first, b: id });
  }
}

export function toggleCompare(): void {
  comparing.value = !comparing.peek();
  compareFirst.value = null;
}

/** The most recent contradiction not yet questioned. */
export function questionable(s: Session): string | undefined {
  const { flagged, questioned } = s.state.soul;
  return [...flagged].reverse().find((f) => !questioned.includes(f.lie))?.lie;
}

// ---------- pieces ----------

function SunBar({ s }: { s: Session }) {
  now.value; // re-render on every tick
  const st = s.state;
  const left = sunLeft(st, clock());
  const pct = st.config.untimed ? 100 : Math.round((left * 100) / st.sunMs);
  const time = st.config.untimed ? t('ui.sun.untimed') : st.clock.dusk ? t('ui.sun.dusk') : clockText(left);
  return (
    <header class={`sunbar${st.clock.dusk ? ' is-dusk' : ''}`}>
      <div class="sunbar__meter" aria-hidden="true">
        <div class="sunbar__fill" style={{ width: `${pct}%` }} />
      </div>
      <span class="sunbar__time" data-testid="sun">
        {time}
      </span>
      <span class="sunbar__count" data-testid="soul-count">
        {t('ui.soul.count', { n: Math.min(st.cursor + 1, st.cases.length), total: st.cases.length })}
      </span>
      {s.mode.kind === 'endless' ? (
        <span class="sunbar__count" data-testid="strikes">
          {t('ui.endless.strikes', { n: s.mode.strikes, max: ENDLESS_STRIKES })}
        </span>
      ) : null}
      <button type="button" class="btn btn--quiet" onClick={() => act({ t: 'pause' })} data-testid="pause">
        {t('ui.pause')}
      </button>
    </header>
  );
}

const pctOf = (v: number, of: number) => `${(v * 100) / of}%`;

function BodyStage({ s, c }: { s: Session; c: CaseSpec }) {
  const provider = art.value;
  const { soul } = s.state;
  const scene = sceneFor(c, soul);
  const svg = useMemo(() => provider.draw(scene), [provider, c.id, soul.view, soul.tools.join()]);
  const { w, h } = provider.frame;
  const stage = useRef<HTMLElement>(null);
  const pixelSize = usePixelFrame(stage, provider.frame);
  const tools = s.ctx.tools;
  return (
    <figure class="stage" data-art={provider.id} ref={stage}>
      <div class="stage__frame" style={pixelSize}>
        <div
          class="stage__art"
          role="img"
          aria-label={t(soul.view === 'front' ? 'ui.body.front' : 'ui.body.back')}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {provider.hotspots(scene).map((spot) => {
          const fields = regionFields(spot, s.state, s.ctx);
          if (fields.length === 0) return null;
          return (
            <button
              key={spot.id}
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              class={`hotspot${regionSeen(spot, s.state, s.ctx) ? ' is-seen' : ''}`}
              data-region={spot.id}
              style={{
                left: pctOf(spot.x, w),
                top: pctOf(spot.y, h),
                width: pctOf(spot.w, w),
                height: pctOf(spot.h, h),
              }}
              onClick={() => act({ t: 'inspect', fields: fields.map((f) => f.id) })}
            />
          );
        })}
      </div>
      <div class="stage__tools">
        {tools.has('flip') ? (
          <button type="button" class="btn btn--tool" data-testid="flip" onClick={() => act({ t: 'flip' })}>
            {t(soul.view === 'front' ? 'ui.flip.toBack' : 'ui.flip.toFront')} <kbd>F</kbd>
          </button>
        ) : null}
        {tools.has('feather') ? (
          <button
            type="button"
            class="btn btn--tool"
            data-testid="feather"
            disabled={soul.tools.includes('feather')}
            onClick={() => act({ t: 'tool', tool: 'feather' })}
          >
            {t('tool.feather')} <kbd>T</kbd>
          </button>
        ) : null}
      </div>
      {/* Later decrees' tools take the other side of the body, so no column outgrows a phone's stage. */}
      <div class="stage__tools stage__tools--more">
        {[...tools.keys()]
          .filter((id) => id !== 'flip' && id !== 'feather')
          .map((id) => (
            <button
              key={id}
              type="button"
              class="btn btn--tool"
              data-testid={id}
              aria-label={id === 'registry' ? t('ui.registry.search') : undefined}
              disabled={soul.tools.includes(id)}
              onClick={() => {
                act({ t: 'tool', tool: id });
                if (id === 'registry' && effectiveLayout() === 'drawer') drawerTab.value = 'registry';
              }}
            >
              {t(`tool.${id}`)}
              {id === 'registry' ? (
                <>
                  {' '}
                  <kbd>G</kbd>
                </>
              ) : null}
            </button>
          ))}
      </div>
    </figure>
  );
}

function Evidence({ s, c, f, variant }: { s: Session; c: CaseSpec; f: Field; variant: 'chip' | 'line' }) {
  const selected = comparing.value && compareFirst.value === f.id;
  const flag = s.state.soul.flagged.find((x) => x.lie === f.id);
  const questioned = s.state.soul.questioned.includes(f.id);
  return (
    <span class={`evidence evidence--${variant}${flag ? ' is-lie' : ''}`}>
      <button
        type="button"
        class={`evidence__pick${selected ? ' is-selected' : ''}`}
        aria-pressed={comparing.value ? selected : undefined}
        data-field={f.id}
        onClick={() => pick(f.id)}
      >
        {fieldText(f, c)}
      </button>
      {flag ? <span class="evidence__badge">{t('ui.contradicted')}</span> : null}
      {flag && !questioned ? (
        <button
          type="button"
          class="btn btn--small"
          data-testid="question"
          onClick={() => act({ t: 'question', lie: f.id })}
        >
          {t('ui.question', { s: questionCostMs(s.state) / 1000 })}
        </button>
      ) : null}
    </span>
  );
}

/** Region label for the "look" chips; both hands show the same signs, so they share one chip. */
const regionLabel = (spot: Hotspot) =>
  t(spot.id === 'handL' || spot.id === 'handR' ? 'region.hands' : `region.${spot.id}`);

function Clues({ s, c }: { s: Session; c: CaseSpec }) {
  const st = s.state;
  const spots = art.value.hotspots(sceneFor(c, st.soul));
  const seen = c.evidence.fields.filter((f) => f.item === 'body' && st.soul.seen.includes(f.id));
  const pending: Hotspot[] = [];
  const pendingFields = new Set<string>();
  for (const spot of spots) {
    const fields = regionFields(spot, st, s.ctx).filter((f) => !st.soul.seen.includes(f.id));
    if (fields.length === 0 || fields.every((f) => pendingFields.has(f.id))) continue;
    for (const f of fields) pendingFields.add(f.id);
    pending.push(spot);
  }
  return (
    <div class="clues">
      {seen.map((f) => (
        <Evidence key={f.id} s={s} c={c} f={f} variant="chip" />
      ))}
      {pending.map((spot) => (
        <button
          key={spot.id}
          type="button"
          class="chip chip--look"
          data-region={spot.id}
          aria-label={t('ui.look', { region: regionLabel(spot) })}
          onClick={() => act({ t: 'inspect', fields: regionFields(spot, st, s.ctx).map((f) => f.id) })}
        >
          {t('ui.look.short', { region: regionLabel(spot) })}
        </button>
      ))}
    </div>
  );
}

function Lines({ s, c, items, empty }: { s: Session; c: CaseSpec; items: readonly Field[]; empty: string }) {
  // Reading a paper counts as looking at it.
  const ids = items.map((f) => f.id).join();
  useEffect(() => {
    const unseen = items.filter((f) => !s.state.soul.seen.includes(f.id)).map((f) => f.id);
    if (unseen.length > 0) act({ t: 'inspect', fields: unseen });
  }, [c.id, ids]);
  if (items.length === 0) return <p class="muted">{empty}</p>;
  return (
    <ul class="lines">
      {items.map((f) => (
        <li key={f.id}>
          <Evidence s={s} c={c} f={f} variant="line" />
        </li>
      ))}
    </ul>
  );
}

function Words({ s, c }: { s: Session; c: CaseSpec }) {
  const items = c.evidence.fields.filter((f) => f.item === 'testimony');
  return (
    <div class="words">
      <p class="words__who">
        {c.evidence.look.name} {c.evidence.look.patronym}
      </p>
      <Lines s={s} c={c} items={items} empty={t('ui.words.none')} />
    </div>
  );
}

function Ravens({ s, c }: { s: Session; c: CaseSpec }) {
  const items = c.evidence.fields.filter((f) => f.item === 'huginn' || f.item === 'muninn');
  return <Lines s={s} c={c} items={items} empty={t('ui.ravens.none')} />;
}

/** The soul's saga tally: its carved lines, and under the rune-lens, any sign it was forged. */
function Tally({ s, c }: { s: Session; c: CaseSpec }) {
  const lens = s.state.soul.tools.includes('runeLens');
  const items = c.evidence.fields.filter((f) => f.item === 'tally' && (f.says !== undefined || lens));
  return (
    <div class="tally" data-testid="tally">
      <Lines s={s} c={c} items={items} empty="" />
      {!lens && s.ctx.tools.has('runeLens') ? <p class="muted">{t('ui.tally.lens')}</p> : null}
    </div>
  );
}

const hasTally = (c: CaseSpec) => c.evidence.fields.some((f) => f.item === 'tally');

/** The registry, looked up by this soul's name once the player searches it. */
function Registry({ s, c }: { s: Session; c: CaseSpec }) {
  const f = c.evidence.fields.find((x) => x.item === 'registry');
  const { name, patronym } = c.evidence.look;
  if (!f || !s.state.soul.tools.includes('registry')) {
    return <p class="muted">{t('ui.registry.unsearched', { name, patronym })}</p>;
  }
  const entry = registryEntry(c, f);
  return (
    <div class="registry" data-testid="registry-entry">
      {entry.kind === 'nobody' ? null : (
        <div
          class="registry__portrait"
          role="img"
          aria-label={t('ui.registry.portrait', { name, patronym })}
          dangerouslySetInnerHTML={{ __html: art.value.portrait(entry) }}
        />
      )}
      <Lines s={s} c={c} items={[f]} empty="" />
    </div>
  );
}

function CompareBar() {
  if (!comparing.value) return null;
  return (
    <div class="comparebar" role="status">
      <span>{t('ui.compare.hint')}</span>
      <button type="button" class="btn btn--small" onClick={toggleCompare}>
        {t('ui.compare.cancel')}
      </button>
    </div>
  );
}

function SendButton({ s }: { s: Session }) {
  const chosen = s.state.soul.stamp;
  const hold = settings.value.holdToSend;
  const pointer = useRef('mouse');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [holding, setHolding] = useState(false);
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const cancel = () => {
    clearTimeout(timer.current);
    setHolding(false);
  };
  useEffect(() => cancel, []);
  return (
    <button
      type="button"
      class={`btn btn--send${holding ? ' is-holding' : ''}`}
      data-testid="send"
      disabled={!chosen}
      onPointerDown={(e) => {
        pointer.current = e.pointerType;
        if (!chosen || !hold || e.pointerType === 'mouse') return;
        setHolding(true);
        timer.current = setTimeout(() => {
          setHolding(false);
          act({ t: 'send' });
        }, 300);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={(e) => {
        // Touch sends by holding; keyboard (detail 0) and mouse send on click.
        const touch = pointer.current === 'touch' || pointer.current === 'pen';
        pointer.current = 'mouse';
        if (hold && touch && e.detail !== 0) return;
        act({ t: 'send' });
      }}
    >
      {t(hold && coarse ? 'ui.send.hold' : 'ui.send')} <kbd>Enter</kbd>
    </button>
  );
}

function StampRack({ s }: { s: Session }) {
  const chosen = s.state.soul.stamp;
  return (
    <fieldset class="stamps">
      <legend class="sr-only">{t('ui.stamp.choose')}</legend>
      {stampsFor(s.ctx).map((d, i) => (
        <button
          key={d}
          type="button"
          class={`stamp stamp--${d.toLowerCase()}`}
          aria-pressed={chosen === d}
          data-dest={d}
          onClick={() => act({ t: 'stamp', dest: d })}
        >
          <kbd>{i + 1}</kbd> {t(`dest.${d}`)}
        </button>
      ))}
      <SendButton s={s} />
    </fieldset>
  );
}

/** Ask Skögul where to look: she points at a piece of what decides the soul, for some sun. */
function HintButton({ s }: { s: Session }) {
  if (!hintsAllowed(s)) return null;
  const none = nextHint(s.state) === null;
  return (
    <button
      type="button"
      class="btn"
      data-testid="hint"
      disabled={none}
      title={none ? t('ui.hint.none') : t('ui.hint.label', { s: PENALTY.hint / 1000 })}
      aria-label={t('ui.hint.label', { s: PENALTY.hint / 1000 })}
      onClick={() => act({ t: 'hint' })}
    >
      {t('ui.hint')} <kbd>H</kbd>
    </button>
  );
}

function ActionBar({ s }: { s: Session }) {
  return (
    <nav class="actionbar">
      <button type="button" class="btn" aria-pressed={comparing.value} data-testid="compare" onClick={toggleCompare}>
        {t('ui.compare')} <kbd>C</kbd>
      </button>
      <HintButton s={s} />
      <button type="button" class="btn btn--primary" data-testid="judge" onClick={() => (stampSheet.value = true)}>
        {t('ui.judge')}
      </button>
    </nav>
  );
}

function StampSheet({ s }: { s: Session }) {
  if (!stampSheet.value) return null;
  return (
    <div class="sheet" role="dialog" aria-label={t('ui.stamp.choose')}>
      <div class="sheet__head">
        <h2>{t('ui.stamp.choose')}</h2>
        <button type="button" class="btn btn--quiet" onClick={() => (stampSheet.value = false)}>
          {t('ui.back')}
        </button>
      </div>
      <StampRack s={s} />
    </div>
  );
}

/** With the rule tracker on (as the shift began), the rules what's been seen of this soul rules out. */
function trackerOut(s: Session): ReadonlySet<string> | undefined {
  return s.state.config.assists?.tracker ? new Set(ruledOut(s.state, s.ctx)) : undefined;
}

function SoulDesk({ s, c, layout }: { s: Session; c: CaseSpec; layout: 'desk' | 'drawer' }) {
  // Keyboard players land on the first thing to look at when a new soul arrives.
  useEffect(() => {
    if (document.activeElement === document.body || document.activeElement === null) {
      document.querySelector<HTMLElement>('.chip--look')?.focus({ preventScroll: true });
    }
  }, [c.id]);

  if (layout === 'desk') {
    return (
      <div class="desk">
        <section class="paper paper--rules" aria-label={t('ui.tab.rules')}>
          <RulesPanel ctx={s.ctx} state={s.state} out={trackerOut(s)} />
        </section>
        <section class="desk__center">
          <BodyStage s={s} c={c} />
          <Clues s={s} c={c} />
        </section>
        <section class="desk__right">
          <div class="paper paper--words">
            <h2>{t('ui.tab.words')}</h2>
            <Words s={s} c={c} />
          </div>
          <div class="paper paper--ravens">
            <h2>{t('ui.tab.ravens')}</h2>
            <Ravens s={s} c={c} />
          </div>
          {s.ctx.tools.has('registry') ? (
            <div class="paper paper--registry">
              <h2>{t('ui.tab.registry')}</h2>
              <Registry s={s} c={c} />
            </div>
          ) : null}
          {hasTally(c) ? (
            <div class="paper paper--tally">
              <h2>{t('ui.tab.tally')}</h2>
              <Tally s={s} c={c} />
            </div>
          ) : null}
        </section>
        <section class="desk__bottom">
          <button
            type="button"
            class="btn"
            aria-pressed={comparing.value}
            data-testid="compare"
            onClick={toggleCompare}
          >
            {t('ui.compare')} <kbd>C</kbd>
          </button>
          <HintButton s={s} />
          <StampRack s={s} />
        </section>
        <CompareBar />
      </div>
    );
  }

  // A soul without a tally has no tally tab; fall back to its words.
  const tab = drawerTab.value === 'tally' && !hasTally(c) ? 'words' : drawerTab.value;
  const tabs = [
    ['words', 'ui.tab.words'],
    ['ravens', 'ui.tab.ravens'],
    ...(hasTally(c) ? ([['tally', 'ui.tab.tally']] as const) : []),
    ...(s.ctx.tools.has('registry') ? ([['registry', 'ui.tab.registry']] as const) : []),
    ['rules', 'ui.tab.rules'],
  ] as const;
  return (
    <div class="drawer">
      <BodyStage s={s} c={c} />
      <Clues s={s} c={c} />
      <div class="tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-tab={id}
            onClick={() => (drawerTab.value = id)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <div class="drawer__panel" role="tabpanel">
        {tab === 'words' ? (
          <Words s={s} c={c} />
        ) : tab === 'ravens' ? (
          <Ravens s={s} c={c} />
        ) : tab === 'registry' ? (
          <Registry s={s} c={c} />
        ) : tab === 'tally' ? (
          <Tally s={s} c={c} />
        ) : (
          <RulesPanel ctx={s.ctx} state={s.state} out={trackerOut(s)} />
        )}
      </div>
      <CompareBar />
      <ActionBar s={s} />
      <StampSheet s={s} />
    </div>
  );
}

/** What leaving a paused shift does to it, by mode (a campaign has its own Save and quit). */
function leaveNote(mode: Session['mode']): string {
  if (mode.kind === 'daily') return mode.ranked ? 'ui.leave.daily' : 'ui.leave.replay';
  return `ui.leave.${mode.kind}`;
}

function PauseOverlay() {
  const focus = useAutoFocus<HTMLButtonElement>();
  const mode = session.value?.mode;
  const campaign = mode?.kind === 'campaign';
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div class="dialog">
        <h2 id="pause-title">{t('ui.paused')}</h2>
        <p>{t('ui.paused.body')}</p>
        <div class="row">
          <button
            type="button"
            class="btn btn--primary"
            data-testid="resume"
            ref={focus}
            onClick={() => act({ t: 'resume' })}
          >
            {t('ui.resume')}
          </button>
          {campaign ? (
            <button type="button" class="btn" data-testid="save-quit" onClick={quitToSlots}>
              {t('ui.campaign.quit')}
            </button>
          ) : mode ? (
            // The shift is paused, and a Daily or Endless run is already saved as it stands.
            <button type="button" class="btn" data-testid="leave-shift" onClick={toTitle}>
              {t('ui.leave')}
            </button>
          ) : null}
        </div>
        {mode && !campaign ? (
          <p class="muted" data-testid="leave-note">
            {t(leaveNote(mode))}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AnswerDialog() {
  const a = answer.value;
  return a ? <AnswerBox a={a} /> : null;
}

function AnswerBox({ a }: { a: { readonly name: string; readonly lines: readonly string[] } }) {
  const focus = useAutoFocus<HTMLButtonElement>();
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="answer-title">
      <div class="dialog dialog--answer">
        <h2 id="answer-title">{t('ui.answer.title', { name: a.name })}</h2>
        {a.lines.map((l) => (
          <p key={l} class="dialog__line">
            {l}
          </p>
        ))}
        <button
          type="button"
          class="btn btn--primary"
          data-testid="answer-close"
          ref={focus}
          onClick={() => (answer.value = null)}
        >
          {t('ui.answer.close')}
        </button>
      </div>
    </div>
  );
}

function CitationSlip({ s }: { s: Session }) {
  const v = citation.value;
  return v ? <CitationBox key={v.index} s={s} v={v} /> : null;
}

function CitationBox({ s, v }: { s: Session; v: Verdict }) {
  const focus = useAutoFocus<HTMLButtonElement>();
  const c = s.state.cases[v.index];
  const rule = s.ctx.rules.find((r) => r.id === v.rule);
  const missed = (c?.evidence.fields ?? []).filter((f) => v.missed.includes(f.id)).map((f) => fieldText(f, c));
  const skipped = skippedText(v.skipped, s.ctx);
  const name = c?.evidence.look.name ?? '';
  const dest = t(`dest.${v.expected}`);
  return (
    <div class="overlay" role="alertdialog" aria-modal="true" aria-labelledby="citation-title">
      <div class="dialog dialog--citation">
        <h2 id="citation-title">{t('ui.citation.title')}</h2>
        {v.stamped === v.expected && skipped.length > 0 ? (
          <p data-testid="citation-skipped">{t('ui.citation.skippedOnly', { name, dest, procs: listText(skipped) })}</p>
        ) : (
          <p>{t('ui.citation.should', { name, dest })}</p>
        )}
        {v.stamped !== v.expected && skipped.length > 0 ? (
          <p data-testid="citation-skipped">{t('ui.citation.skipped', { procs: listText(skipped) })}</p>
        ) : null}
        {rule ? <p class="dialog__rule">{t(ruleText(rule, s.ctx.day))}</p> : null}
        {missed.length > 0 ? <p>{t('ui.citation.missed', { fields: listText(missed) })}</p> : null}
        <div class="row">
          <button
            type="button"
            class="btn btn--primary"
            data-testid="citation-close"
            ref={focus}
            onClick={() => (citation.value = null)}
          >
            {t('ui.citation.close')}
          </button>
          <button
            type="button"
            class="btn btn--quiet"
            data-testid="citation-report"
            onClick={() => openReport(s, v.index)}
          >
            {t('ui.report.dispute')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Report this soul": the report as text, a copy button and the pre-filled GitHub form. */
export function ReportDialog() {
  const r = reportFor.value;
  return r ? <ReportBox r={r} /> : null;
}

function ReportBox({ r }: { r: SoulReport }) {
  const focus = useAutoFocus<HTMLButtonElement>();
  const [copied, setCopied] = useState<boolean | null>(null);
  const json = JSON.stringify(r);
  const url = reportUrl(r);
  return (
    <div class="overlay overlay--top" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div class="dialog">
        <h2 id="report-title">{t('ui.report.title')}</h2>
        <p>{t('ui.report.body')}</p>
        <p class="muted">{reportTitle(r)}</p>
        <textarea class="share share--small" readOnly rows={4} value={json} data-testid="report-text" />
        <div class="row">
          {url ? (
            <a class="btn btn--primary" href={url} target="_blank" rel="noopener noreferrer" data-testid="report-open">
              {t('ui.report.open')}
            </a>
          ) : null}
          <button
            type="button"
            class="btn"
            data-testid="report-copy"
            onClick={async () => setCopied(await copyText(json))}
          >
            {t(copied === true ? 'ui.report.copied' : copied === false ? 'ui.report.copyFailed' : 'ui.report.copy')}
          </button>
          <button
            type="button"
            class="btn btn--quiet"
            data-testid="report-close"
            ref={focus}
            onClick={() => (reportFor.value = null)}
          >
            {t('ui.report.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The coach: the primer's steps, or the lesson of a day's first soul. One instruction at a time, with Next
 * for reading steps. Skipping the primer leaves it; skipping a lesson only puts it away.
 */
function CoachBar({ s, lesson }: { s: Session; lesson: Lesson | null }) {
  const now = coachStep(s, coachAcks.value, lesson);
  const primer = s.mode.kind === 'primer';
  if (!primer && !lesson) return null;
  const step = now?.step;
  return (
    <div class="coach" data-testid="coach" data-step={step?.id ?? 'none'}>
      <p class="coach__text" role="status" aria-live="polite">
        {step ? t(step.text) : ''}
      </p>
      <div class="coach__actions">
        {step?.next ? (
          <button
            type="button"
            class="btn btn--primary btn--small"
            data-testid="coach-next"
            onClick={() => (coachAcks.value = [...coachAcks.value, step.id])}
          >
            {t(primer ? 'primer.next' : 'ui.coach.next')}
          </button>
        ) : null}
        <button
          type="button"
          class="btn btn--quiet btn--small"
          data-testid="coach-skip"
          onClick={() => {
            if (primer) {
              updateSettings({ primerDone: true });
              toTitle();
            } else noteCoached(s.ctx.day);
          }}
        >
          {t(primer ? 'primer.skip' : 'ui.coach.skip')}
        </button>
      </div>
    </div>
  );
}

export function ToastView() {
  const msg = toast.value;
  return (
    <div class="toast-region" role="status" aria-live="polite">
      {msg ? (
        <p key={msg.id} class={`toast toast--${msg.tone}`}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}

export function ShiftScreen() {
  const s = session.value;
  if (!s) return null;
  const layout = effectiveLayout();
  const paused = s.state.clock.pausedAt !== null;
  const blocked = paused || answer.value !== null || citation.value !== null || reportFor.value !== null;
  const c = currentCase(s.state);
  const lesson = activeLesson(s, coachState());
  const coach = coachStep(s, coachAcks.value, lesson);
  return (
    <div
      class={`shift shift--${layout}${paused ? ' is-paused' : ''}${comparing.value ? ' is-comparing' : ''}`}
      data-layout={layout}
      data-coach={coach?.focus ?? pendingHintFocus(s.state)}
    >
      <div class="shift__desk" inert={blocked}>
        <SunBar s={s} />
        <CoachBar s={s} lesson={lesson} />
        {c ? <SoulDesk key={c.id} s={s} c={c} layout={layout} /> : null}
      </div>
      {paused ? <PauseOverlay /> : null}
      <AnswerDialog />
      <CitationSlip s={s} />
      <ReportDialog />
      <ToastView />
    </div>
  );
}
