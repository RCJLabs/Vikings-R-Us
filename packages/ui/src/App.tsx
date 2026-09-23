import { manifest } from 'virtual:content';
import { placeholderSigil } from '@cots/art-placeholder';
import { type CivilDate, dailyNumber } from '@cots/engine';
import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { t } from './i18n';
import { layoutMode } from './layout';

function todayLocal(): CivilDate {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function dailyLabel(): string {
  const n = dailyNumber(todayLocal());
  return n >= 1 ? t('core.daily.label', { n }) : t('core.daily.countdown', { days: 1 - n });
}

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

export function App() {
  return (
    <main class={`app app--${layoutMode.value}`}>
      <header class="app__header">
        <div class="app__sigil" dangerouslySetInnerHTML={{ __html: placeholderSigil() }} />
        <h1>{t('core.title')}</h1>
        <p class="app__tagline">{t('core.tagline')}</p>
      </header>
      <section class="app__panel">
        <dl>
          <dt>{t('core.ui.build')}</dt>
          <dd data-testid="target">{manifest.target}</dd>
          <dt>{t('core.ui.edition')}</dt>
          <dd data-testid="edition">{manifest.edition}</dd>
          <dt>{t('core.ui.content')}</dt>
          <dd data-testid="packs">{manifest.packs.join(' · ')}</dd>
          <dt>{t('core.ui.layout')}</dt>
          <dd data-testid="layout">{layoutMode.value}</dd>
          <dt>{t('core.ui.today')}</dt>
          <dd data-testid="daily">{dailyLabel()}</dd>
        </dl>
      </section>
      <p class="app__status">{t('core.status.m0')}</p>
      {manifest.lab ? <LabLoader /> : null}
    </main>
  );
}
