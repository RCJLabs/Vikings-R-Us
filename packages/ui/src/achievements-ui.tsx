import { gameContent } from 'virtual:content';
import type { AchievementDef } from '@cots/engine';
import { useEffect, useState } from 'preact/hooks';
import { t } from './i18n';
import { screen, settings, unannounced } from './store';

/*
 * Achievements on screen (docs/tech-spec.md §34): a notice once one is earned, and the gallery on the
 * title screen. A hidden achievement keeps its name to itself until it's earned.
 */

const defs = (): readonly AchievementDef[] => gameContent.achievements ?? [];

/** The day it was earned, in the player's own way of writing dates. */
const dateText = (at: number): string =>
  new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** How long a notice stays: a few seconds, and one more for each achievement on it. */
const noteMs = (n: number): number => 4000 + 1000 * n;

/**
 * What was just earned, at the top of the screen for a few seconds. Earned during a shift, it waits for the
 * screen after it: nothing covers the desk while the sun runs. Earned by the last battle, it waits for the ending,
 * so an ending's own achievement doesn't name it before the battle's told (docs/tech-spec.md §54). It takes no
 * clicks, and screen readers say it.
 */
export function AchievementNote() {
  const [shown, setShown] = useState<{ readonly key: number; readonly ids: readonly string[] } | null>(null);
  const waiting = unannounced.value;
  const onShift = screen.value === 'shift' || screen.value === 'ragnarok' || screen.value === 'battle';
  useEffect(() => {
    if (onShift || waiting.length === 0) return;
    unannounced.value = [];
    // One still showing takes the new ones on.
    setShown((prev) => ({ key: (prev?.key ?? 0) + 1, ids: [...(prev?.ids ?? []), ...waiting] }));
  }, [onShift, waiting]);
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), noteMs(shown.ids.length));
    return () => clearTimeout(timer);
  }, [shown]);
  // A shift begun while one is showing hides it: the gallery has it.
  const earned = shown && !onShift ? defs().filter((a) => shown.ids.includes(a.id)) : [];
  return (
    <div class="award-region" role="status" aria-live="polite">
      {shown && earned.length > 0 ? (
        <div key={shown.key} class="award" data-testid="achievement-note">
          <span class="award__label">{t('ui.achievements.note', { n: earned.length })}</span>
          {earned.map((a) => (
            <strong key={a.id} class="award__title">
              {t(a.title)}
            </strong>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Every achievement this build has, earned or not; the hidden ones unnamed until they're found. */
export function AchievementsCard() {
  const all = defs();
  if (all.length === 0) return null;
  const have = settings.value.achievements;
  const n = all.filter((a) => Object.hasOwn(have, a.id)).length;
  return (
    <details class="card card--achievements" data-testid="achievements">
      <summary>
        {t('ui.achievements')}{' '}
        <span class="muted" data-testid="achievements-count">
          {t('ui.achievements.count', { n, total: all.length })}
        </span>
      </summary>
      <p class="muted">{t('ui.achievements.hint')}</p>
      <ul class="achievements">
        {all.map((a) => {
          const at = have[a.id];
          const earned = at !== undefined;
          const secret = a.hidden === true && !earned;
          return (
            <li key={a.id} class={earned ? 'achievement is-earned' : 'achievement'} data-id={a.id}>
              <span class="achievement__mark" aria-hidden="true">
                {earned ? '★' : '☆'}
              </span>
              <span class="achievement__body">
                <strong>{secret ? t('ui.achievements.hidden') : t(a.title)}</strong>
                <span>{secret ? t('ui.achievements.hiddenText') : t(a.text)}</span>
                <span class="muted achievement__when">
                  {earned ? t('ui.achievements.earned', { date: dateText(at) }) : t('ui.achievements.notYet')}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
