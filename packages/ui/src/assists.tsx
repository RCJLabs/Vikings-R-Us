import { type Assists, cleanAssists, SUN_SPEEDS } from '@cots/engine';
import { listText, t } from './i18n';
import { type Settings, settings, updateSettings } from './store';

/*
 * Assists (docs/tech-spec.md §24): a slower or faster sun, the rule tracker, and no fines in the
 * campaign. They're device settings, taken up as each shift begins and kept with it.
 */

/** A sun of `ms` at a speed in percent, as the shift will have it. */
export function atSunSpeed(ms: number, sunPct: number | undefined): number {
  return Math.floor((ms * 100) / (sunPct ?? 100));
}

/** "sun ×0.5, the rule tracker and no fines", or null when none are on. */
export function assistText(a: Assists | undefined): string | null {
  const c = cleanAssists(a);
  const parts = [
    ...(c.sunPct !== undefined ? [t('ui.assist.list.sun', { speed: c.sunPct / 100 })] : []),
    ...(c.tracker ? [t('ui.assist.list.tracker')] : []),
    ...(c.noFines ? [t('ui.assist.list.noFines')] : []),
  ];
  return parts.length > 0 ? listText(parts) : null;
}

/**
 * The assists' controls, in the title screen's settings and on a campaign morning (where Story Mode,
 * with no sun and no fines already, leaves only the rule tracker). `titled` shows their heading, which a
 * morning's own "Assists" toggle already gives.
 */
export function AssistSettings({
  campaign,
  sun = true,
  titled = true,
}: {
  campaign: boolean;
  sun?: boolean;
  titled?: boolean;
}) {
  const s = settings.value;
  const set = (patch: Partial<Settings>) => updateSettings(patch);
  return (
    <fieldset class="assists" data-testid="assists">
      <legend class={titled ? undefined : 'sr-only'}>{t('ui.settings.assists')}</legend>
      {sun ? (
        <label class="assists__sun">
          <span>{t('ui.assist.sun')}</span>
          <select
            value={String(s.sunPct)}
            data-testid="setting-sun"
            onChange={(e) => set({ sunPct: Number((e.target as HTMLSelectElement).value) })}
          >
            {SUN_SPEEDS.map((p) => (
              <option key={p} value={String(p)}>
                {t(`ui.assist.sun.${p}`)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        <input
          type="checkbox"
          checked={s.ruleTracker}
          data-testid="setting-tracker"
          onChange={(e) => set({ ruleTracker: (e.target as HTMLInputElement).checked })}
        />{' '}
        {t('ui.assist.tracker')}
      </label>
      {campaign ? (
        <label>
          <input
            type="checkbox"
            checked={s.noFines}
            data-testid="setting-no-fines"
            onChange={(e) => set({ noFines: (e.target as HTMLInputElement).checked })}
          />{' '}
          {t('ui.assist.noFines')}
        </label>
      ) : null}
      <p class="muted">{t('ui.assist.note')}</p>
    </fieldset>
  );
}
