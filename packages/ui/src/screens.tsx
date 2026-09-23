import { dailyContent, gameContent, manifest } from 'virtual:content';
import { placeholderSigil } from '@cots/art-placeholder';
import { shiftScore } from '@cots/engine';
import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { clockText, t } from './i18n';
import { Decree, RulesPanel } from './shift/Rules';
import { ToastView, useAutoFocus } from './shift/Shift';
import {
  begin,
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
  startPractice,
  storageReady,
  streakOf,
  today,
  toTitle,
  updateSettings,
} from './store';

/** Loads the Case Lab only in dev-full; the MODE check is replaced at build time, so other builds drop it. */
function LabLoader() {
  const [Lab, setLab] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (import.meta.env.MODE === 'dev-full') {
      void import('./lab/CaseLab').then((m) => setLab(() => m.CaseLab));
    }
  }, []);
  return Lab ? <Lab /> : null;
}

function DailyCard() {
  const { n, date, preview } = today();
  const result = dailyRecord.value.results[String(n)];
  const progress = dailyProgress.value;
  const resumable = !result && progress?.n === n && progress.g === dailyContent?.genVersion;
  const streak = streakOf(dailyRecord.value, n);
  if (!dailyContent?.daily) return null;
  return (
    <section class="card card--daily">
      {result ? (
        <p class="card__result" data-testid="daily-result">
          {t('ui.daily.result', { correct: result.correct, total: result.total })} {result.marks}
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
    </details>
  );
}

export function Title() {
  const days = gameContent.days.map((d) => d.day);
  return (
    <main class="screen screen--title" data-layout={effectiveLayout()}>
      <header class="title__header">
        <div class="title__sigil" dangerouslySetInnerHTML={{ __html: placeholderSigil() }} />
        <h1>{t('core.title')}</h1>
        <p class="muted">{t('core.tagline')}</p>
      </header>
      <DailyCard />
      <section class="card">
        <h2>{t('ui.practice')}</h2>
        <div class="row">
          {days.map((d) => (
            <button key={d} type="button" class="btn" data-testid={`practice-${d}`} onClick={() => startPractice(d)}>
              {t('ui.practice.day', { n: d })}
            </button>
          ))}
        </div>
        <p class="muted">{t('ui.practice.hint')}</p>
      </section>
      <p class="muted howto">{t('ui.howto')}</p>
      <SettingsCard />
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
  return s.mode.preview ? t('ui.briefing.preview') : t('ui.briefing.daily', { n: s.mode.n });
}

export function Briefing() {
  const focus = useAutoFocus<HTMLButtonElement>();
  const s = session.value;
  if (!s) return null;
  const st = s.state;
  return (
    <main class="screen screen--briefing">
      <h1 data-testid="briefing-title">{modeTitle(s)}</h1>
      <Decree ctx={s.ctx} />
      <p class="briefing__queue">
        {st.config.untimed
          ? t('ui.briefing.untimed', { n: st.cases.length })
          : t('ui.briefing.queue', { n: st.cases.length, time: clockText(st.sunMs) })}
      </p>
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
    </main>
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
  return (
    <main class="screen screen--summary">
      <h1>{t(st.endedBy === 'dusk' ? 'ui.summary.dusk' : 'ui.summary.done')}</h1>
      <p class="summary__score" data-testid="score">
        {t('ui.summary.score', { correct: score.correct, total: score.total })}
      </p>
      {score.spareMs > 0 ? <p>{t('ui.summary.spare', { time: clockText(score.spareMs) })}</p> : null}
      <p>{t('ui.summary.caught', { n: score.caught })}</p>
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
              ) : v.correct ? null : (
                <span class="muted"> ({t('ui.summary.you', { dest: t(`dest.${v.stamped}`) })})</span>
              )}
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
      <button type="button" class="btn" data-testid="home" onClick={toTitle}>
        {t('ui.summary.home')}
      </button>
      <ToastView />
    </main>
  );
}
