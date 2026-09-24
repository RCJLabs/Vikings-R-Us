import { dailyContent, gameContent, manifest } from 'virtual:content';
import { placeholderSigil } from '@cots/art';
import { ENDLESS_SOULS, ENDLESS_STRIKES, shiftScore } from '@cots/engine';
import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { artStyle } from './art';
import { AssistSettings, assistText, atSunSpeed } from './assists';
import { openCampaign } from './campaign/lazy';
import { clockText, listText, t } from './i18n';
import { issueFormUrl, links } from './links';
import { openReport } from './report';
import { skippedText } from './shift/evidence';
import { Decree, RulesPanel } from './shift/Rules';
import { ReportDialog, ToastView, useAutoFocus } from './shift/Shift';
import {
  applyUpdate,
  begin,
  currentAssists,
  dailyProgress,
  dailyRecord,
  effectiveLayout,
  epochText,
  type Session,
  type Settings,
  session,
  settings,
  shareBody,
  shareResult,
  startDaily,
  startEndless,
  startPractice,
  startPrimer,
  storageReady,
  streakOf,
  telemetryAvailable,
  today,
  toTitle,
  updateReady,
  updateSettings,
} from './store';

/** Loads the Case Lab and Body Lab only in dev-full; the MODE check is replaced at build time, so other builds drop them. */
function LabLoader() {
  const [labs, setLabs] = useState<readonly ComponentType[] | null>(null);
  useEffect(() => {
    if (import.meta.env.MODE === 'dev-full') {
      void Promise.all([import('./lab/CaseLab'), import('./lab/BodyLab')]).then(([a, b]) =>
        setLabs([a.CaseLab, b.BodyLab]),
      );
    }
  }, []);
  return labs ? labs.map((Lab, i) => <Lab key={i} />) : null;
}

/** One line identifying this build and device, for feedback forms. */
function buildLine(): string {
  return `${manifest.target} ${manifest.contentHash} · ${effectiveLayout()} · art ${artStyle.value} · ${window.innerWidth}x${window.innerHeight} · ${navigator.userAgent}`;
}

function feedbackUrl(): string | undefined {
  return issueFormUrl('playtest.yml', { build: buildLine() }, 'Playtest feedback');
}

function Links() {
  const feedback = feedbackUrl();
  const items = [
    feedback ? { href: feedback, label: t('ui.feedback'), id: 'feedback' } : null,
    links.community ? { href: links.community, label: t('ui.community'), id: 'community' } : null,
    telemetryAvailable() && links.privacy ? { href: links.privacy, label: t('ui.privacy'), id: 'privacy' } : null,
  ].filter((x) => x !== null);
  if (items.length === 0) return null;
  return (
    <nav class="links">
      {items.map((x) => (
        <a key={x.id} href={x.href} target="_blank" rel="noopener noreferrer" data-testid={`link-${x.id}`}>
          {x.label}
        </a>
      ))}
    </nav>
  );
}

function DailyCard() {
  const { n, date, preview } = today();
  const result = dailyRecord.value.results[String(n)];
  const progress = dailyProgress.value;
  const resumable = !result && progress?.n === n && progress.g === dailyContent?.genVersion;
  const streak = streakOf(dailyRecord.value, n);
  const newcomer = dailyContent?.primer !== undefined && !settings.value.primerDone && !result && !resumable;
  if (!dailyContent?.daily) return null;
  return (
    <section class="card card--daily">
      {newcomer ? (
        <>
          <p>{t('primer.hint')}</p>
          <button type="button" class="btn btn--big" data-testid="play-primer" onClick={startPrimer}>
            {t('primer.play')}
          </button>
        </>
      ) : null}
      {result ? (
        <p class="card__result" data-testid="daily-result">
          {t('ui.daily.result', { correct: result.correct, total: result.total })} {result.marks}
        </p>
      ) : null}
      {result && assistText(result.assists) ? (
        <p class="muted" data-testid="daily-assisted">
          {t('ui.daily.assisted', { list: assistText(result.assists) ?? '' })}
        </p>
      ) : null}
      <button
        type="button"
        class="btn btn--primary btn--big"
        data-testid="play-daily"
        disabled={!storageReady.value}
        onClick={startDaily}
      >
        {resumable
          ? t('ui.daily.resume')
          : result
            ? t('ui.daily.replay')
            : preview
              ? t('ui.daily.preview', { date })
              : t('ui.daily.play', { n })}
      </button>
      {preview ? <p class="muted">{t('ui.daily.previewNote', { date: epochText() })}</p> : null}
      {streak.best > 0 ? (
        <p class="muted" data-testid="streak">
          {t('ui.daily.streak', { n: streak.current, best: streak.best })}
        </p>
      ) : null}
    </section>
  );
}

function CampaignCard() {
  if (!gameContent.campaign) return null;
  return (
    <section class="card card--campaign">
      <h2>{t('ui.campaign')}</h2>
      <p>{t(manifest.edition === 'demo' ? 'ui.campaign.hint.demo' : 'ui.campaign.hint.full')}</p>
      <button
        type="button"
        class="btn btn--primary btn--big"
        data-testid="play-campaign"
        disabled={!storageReady.value}
        onClick={() => void openCampaign()}
      >
        {t('ui.campaign.play')}
      </button>
    </section>
  );
}

function SettingsCard() {
  const s = settings.value;
  const set = (patch: Partial<Settings>) => updateSettings(patch);
  return (
    <details class="card card--settings">
      <summary>{t('ui.settings')}</summary>
      <label>
        {t('ui.settings.layout')}{' '}
        <select
          value={s.layout}
          data-testid="setting-layout"
          onChange={(e) => set({ layout: (e.target as HTMLSelectElement).value as Settings['layout'] })}
        >
          <option value="auto">{t('ui.settings.layout.auto')}</option>
          <option value="desk">{t('ui.settings.layout.desk')}</option>
          <option value="drawer">{t('ui.settings.layout.drawer')}</option>
        </select>
      </label>
      <label>
        {t('ui.settings.text')}{' '}
        <input
          type="range"
          min="0.85"
          max="1.75"
          step="0.05"
          value={s.textScale}
          onInput={(e) => set({ textScale: Number((e.target as HTMLInputElement).value) })}
        />
      </label>
      <label>
        {t('ui.settings.sound')}{' '}
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={s.sound}
          data-testid="setting-sound"
          onInput={(e) => set({ sound: Number((e.target as HTMLInputElement).value) })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={s.holdToSend}
          onChange={(e) => set({ holdToSend: (e.target as HTMLInputElement).checked })}
        />{' '}
        {t('ui.settings.hold')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={s.untimedPractice}
          onChange={(e) => set({ untimedPractice: (e.target as HTMLInputElement).checked })}
        />{' '}
        {t('ui.settings.untimed')}
      </label>
      {gameContent.campaign ? (
        <label>
          <input
            type="checkbox"
            checked={s.coach}
            data-testid="setting-coach"
            onChange={(e) => set({ coach: (e.target as HTMLInputElement).checked })}
          />{' '}
          {t('ui.settings.coach')}
        </label>
      ) : null}
      <AssistSettings campaign={gameContent.campaign !== undefined} />
      {telemetryAvailable() ? (
        <label>
          <input
            type="checkbox"
            checked={s.telemetry}
            data-testid="setting-telemetry"
            onChange={(e) => set({ telemetry: (e.target as HTMLInputElement).checked, telemetryAsked: true })}
          />{' '}
          {t('ui.telemetry.setting')}
        </label>
      ) : null}
    </details>
  );
}

export function Title() {
  const days = gameContent.days.map((d) => d.day);
  return (
    <main class="screen screen--title" data-layout={effectiveLayout()}>
      {updateReady.value ? (
        <div class="banner" role="status" data-testid="update-ready">
          <span>{t('ui.update.ready')}</span>
          <button type="button" class="btn btn--primary btn--small" onClick={applyUpdate}>
            {t('ui.update.apply')}
          </button>
        </div>
      ) : null}
      <header class="title__header">
        <div class="title__sigil" dangerouslySetInnerHTML={{ __html: placeholderSigil() }} />
        <h1>{t('core.title')}</h1>
        <p class="muted">{t('core.tagline')}</p>
      </header>
      <DailyCard />
      <CampaignCard />
      <section class="card">
        <h2>{t('ui.practice')}</h2>
        <div class="row">
          {days.map((d) => (
            <button key={d} type="button" class="btn" data-testid={`practice-${d}`} onClick={() => startPractice(d)}>
              {t('ui.practice.day', { n: d })}
            </button>
          ))}
          {dailyContent?.primer && settings.value.primerDone ? (
            <button type="button" class="btn" data-testid="replay-primer" onClick={startPrimer}>
              {t('primer.title')}
            </button>
          ) : null}
        </div>
        <p class="muted">{t('ui.practice.hint')}</p>
      </section>
      <section class="card" data-testid="endless-card">
        <h2>{t('ui.endless')}</h2>
        <p class="muted">{t('ui.endless.hint', { n: ENDLESS_SOULS, strikes: ENDLESS_STRIKES })}</p>
        <div class="row">
          <button type="button" class="btn" data-testid="endless-start" onClick={startEndless}>
            {t('ui.endless.start')}
          </button>
          {settings.value.endlessBest > 0 ? (
            <span class="muted" data-testid="endless-best">
              {t('ui.endless.best', { n: settings.value.endlessBest })}
            </span>
          ) : null}
        </div>
      </section>
      {manifest.edition === 'demo' && links.steam ? (
        <a class="btn btn--big wishlist" href={links.steam} target="_blank" rel="noopener noreferrer">
          {t('demo.wishlist')}
        </a>
      ) : null}
      <p class="muted howto">{t('ui.howto')}</p>
      <SettingsCard />
      <Links />
      <footer class="title__footer muted">
        <span data-testid="target">{manifest.target}</span> · <span data-testid="edition">{manifest.edition}</span> ·{' '}
        <span data-testid="packs">{manifest.packs.join(' · ')}</span> ·{' '}
        <span data-testid="layout">{effectiveLayout()}</span>
        <span class="title__keys">
          <br />
          {t('ui.keys')}
        </span>
      </footer>
      {manifest.lab ? <LabLoader /> : null}
    </main>
  );
}

function modeTitle(s: Session): string {
  if (s.mode.kind === 'practice') return t('ui.briefing.practice', { n: s.mode.day });
  if (s.mode.kind === 'endless') return t('ui.endless.round', { n: s.mode.round + 1, day: s.mode.day });
  if (s.mode.kind === 'primer') return t('primer.title');
  if (s.mode.kind === 'campaign') return t('ui.campaign.day', { n: s.mode.day });
  return s.mode.preview ? t('ui.briefing.preview') : t('ui.briefing.daily', { n: s.mode.n });
}

export function Briefing() {
  const focus = useAutoFocus<HTMLButtonElement>();
  const s = session.value;
  if (!s) return null;
  const st = s.state;
  // The shift takes up the assists as it begins; until then, show the sun they'll give it.
  const assists = currentAssists(false, st.config.untimed);
  const assisted = assistText(assists);
  return (
    <main class="screen screen--briefing">
      <h1 data-testid="briefing-title">{modeTitle(s)}</h1>
      {s.mode.kind === 'daily' && s.mode.guard === 'mismatch' ? (
        <div class="banner banner--bad" role="alert" data-testid="guard-mismatch">
          <p>{t('ui.guard.mismatch')}</p>
          <button type="button" class="btn btn--small" onClick={() => openReport(s, 0)}>
            {t('ui.guard.report')}
          </button>
        </div>
      ) : null}
      {s.mode.kind === 'endless' ? (
        <p class="briefing__queue" data-testid="endless-status">
          {t('ui.endless.status', { n: s.mode.judged, strikes: s.mode.strikes, max: ENDLESS_STRIKES })}
        </p>
      ) : null}
      <Decree ctx={s.ctx} />
      <p class="briefing__queue">
        {st.config.untimed
          ? t('ui.briefing.untimed', { n: st.cases.length })
          : t('ui.briefing.queue', { n: st.cases.length, time: clockText(atSunSpeed(st.sunMs, assists.sunPct)) })}
      </p>
      {assisted ? (
        <p class="muted" data-testid="briefing-assists">
          {t('ui.assist.on', { list: assisted })}
        </p>
      ) : null}
      <div class="row">
        <button type="button" class="btn btn--primary btn--big" data-testid="begin" ref={focus} onClick={begin}>
          {t('ui.begin')}
        </button>
        <button type="button" class="btn" onClick={toTitle}>
          {t('ui.back')}
        </button>
      </div>
      <section class="card">
        <RulesPanel ctx={s.ctx} decree={false} />
      </section>
      <ReportDialog />
    </main>
  );
}

/** Endless is over: three strikes. */
export function EndlessOver() {
  const focus = useAutoFocus<HTMLButtonElement>();
  const s = session.value;
  if (s?.mode.kind !== 'endless') return null;
  const m = s.mode;
  return (
    <main class="screen screen--summary">
      <h1 data-testid="endless-over">{t('ui.endless.over')}</h1>
      <p class="summary__score" data-testid="endless-score">
        {t('ui.endless.score', { n: m.judged, day: m.day })}
      </p>
      <p data-testid="endless-record">
        {m.judged > m.bestBefore ? t('ui.endless.newBest') : t('ui.endless.best', { n: settings.value.endlessBest })}
      </p>
      <div class="row">
        <button type="button" class="btn btn--primary" data-testid="endless-again" ref={focus} onClick={startEndless}>
          {t('ui.endless.again')}
        </button>
        <button type="button" class="btn" data-testid="home" onClick={toTitle}>
          {t('ui.summary.home')}
        </button>
      </div>
    </main>
  );
}

/** Asked once, after the first finished Daily, and only in builds with a telemetry endpoint. */
function TelemetryAsk() {
  if (!telemetryAvailable() || settings.value.telemetryAsked) return null;
  return (
    <section class="card card--ask" data-testid="telemetry-ask">
      <h2>{t('ui.telemetry.ask.title')}</h2>
      <p>{t('ui.telemetry.ask.body')}</p>
      <div class="row">
        <button
          type="button"
          class="btn btn--primary"
          data-testid="telemetry-yes"
          onClick={() => updateSettings({ telemetry: true, telemetryAsked: true })}
        >
          {t('ui.telemetry.yes')}
        </button>
        <button
          type="button"
          class="btn"
          data-testid="telemetry-no"
          onClick={() => updateSettings({ telemetry: false, telemetryAsked: true })}
        >
          {t('ui.telemetry.no')}
        </button>
        {links.privacy ? (
          <a href={links.privacy} target="_blank" rel="noopener noreferrer">
            {t('ui.telemetry.more')}
          </a>
        ) : null}
      </div>
    </section>
  );
}

function PrimerDone() {
  return (
    <section class="card card--ready" data-testid="primer-done">
      <h2>{t('primer.done.title')}</h2>
      <p>{t('primer.done.body')}</p>
      <div class="row">
        <button type="button" class="btn btn--primary" data-testid="primer-to-daily" onClick={startDaily}>
          {t('primer.toDaily')}
        </button>
      </div>
    </section>
  );
}

export function Summary() {
  const s = session.value;
  const [shared, setShared] = useState<string | null>(null);
  if (!s) return null;
  const st = s.state;
  const score = shiftScore(st);
  const daily = s.mode.kind === 'daily';
  const { text, url } = shareBody(s);
  const feedback = feedbackUrl();
  return (
    <main class="screen screen--summary">
      <h1>{t(st.endedBy === 'dusk' ? 'ui.summary.dusk' : 'ui.summary.done')}</h1>
      <p class="summary__score" data-testid="score">
        {t('ui.summary.score', { correct: score.correct, total: score.total })}
      </p>
      {score.spareMs > 0 ? (
        // Whole seconds, rounded down like the share text.
        <p>{t('ui.summary.spare', { time: clockText(score.spareMs - (score.spareMs % 1000)) })}</p>
      ) : null}
      <p>{t('ui.summary.caught', { n: score.caught })}</p>
      {s.mode.kind === 'primer' ? <PrimerDone /> : null}
      <ol class="verdicts">
        {st.verdicts.map((v) => {
          const c = st.cases[v.index];
          const name = c ? `${c.evidence.look.name} ${c.evidence.look.patronym}` : '';
          return (
            <li key={v.index} class={v.correct ? 'is-right' : 'is-wrong'} data-testid="verdict">
              <span aria-hidden="true">{v.stamped === null ? '⬛' : v.correct ? '🟩' : '🟥'}</span>{' '}
              {t('ui.summary.row', { name, dest: t(`dest.${v.expected}`) })}
              {v.stamped === null ? (
                <span class="muted"> ({t('ui.summary.unjudged')})</span>
              ) : v.correct ? null : v.stamped === v.expected ? (
                <span class="muted">
                  {' '}
                  ({t('ui.summary.skipped', { procs: listText(skippedText(v.skipped, s.ctx)) })})
                </span>
              ) : (
                <span class="muted"> ({t('ui.summary.you', { dest: t(`dest.${v.stamped}`) })})</span>
              )}{' '}
              <button
                type="button"
                class="btn btn--quiet btn--small"
                data-testid="report-soul"
                aria-label={t('ui.report.rowLabel', { name })}
                onClick={() => openReport(s, v.index)}
              >
                {t('ui.report.row')}
              </button>
            </li>
          );
        })}
      </ol>
      {daily ? (
        <section class="card">
          <button
            type="button"
            class="btn btn--primary"
            data-testid="share"
            onClick={async () => {
              const r = await shareResult(s);
              setShared(
                r === 'copied'
                  ? t('ui.summary.copied')
                  : r === 'shared'
                    ? t('ui.summary.shared')
                    : t('ui.summary.shareFailed'),
              );
            }}
          >
            {t('ui.summary.share')}
          </button>
          {shared ? (
            <p role="status" data-testid="share-status">
              {shared}
            </p>
          ) : null}
          <textarea class="share" readOnly rows={4} data-testid="share-text" value={url ? `${text}\n${url}` : text} />
        </section>
      ) : null}
      {daily ? <TelemetryAsk /> : null}
      <div class="row">
        <button type="button" class="btn" data-testid="home" onClick={toTitle}>
          {t('ui.summary.home')}
        </button>
        {feedback ? (
          <a
            class="btn btn--quiet"
            href={feedback}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="summary-feedback"
          >
            {t('ui.feedback')}
          </a>
        ) : null}
      </div>
      <ReportDialog />
      <ToastView />
    </main>
  );
}
