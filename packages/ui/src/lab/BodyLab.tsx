import { gameContent } from 'virtual:content';
import { ART_STYLES, type BodyArtProvider } from '@cots/art';
import { artSheet, bodySigns, SHEET_CSS, type Sign, WEAPON_SIGN } from '@cots/art/sheet';
import type { Value } from '@cots/engine';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { artStyle, loadArt, setArtStyle } from '../art';
import { t } from '../i18n';

/** How a sign's value reads to the player (the chip text). */
function signLabel(sign: Sign, value: Value): string {
  if (sign.kind === 'weapon') return t('tm.weapon.yes.2', { weapon: String(value) });
  if (sign.kind === 'cue') return value ? t(`cue.${sign.key}`) : `No ${sign.key}`;
  if (typeof value === 'number') return t(`obs.${sign.key}`, { n: value });
  return t(`obs.${sign.key}.${String(value)}`, { name: 'Toki', patronym: 'Ulfsson', other: 'Hrafn' });
}

/**
 * The Body Lab (docs/tech-spec.md §11, dev builds only): every body sign drawn
 * by every art provider at small-phone size and through a loupe, and a switch
 * for the art the game plays with.
 */
export function BodyLab() {
  const [providers, setProviders] = useState<BodyArtProvider[]>([]);
  const [only, setOnly] = useState('');
  useEffect(() => {
    void Promise.all(ART_STYLES.map((s) => loadArt(s))).then(setProviders);
  }, []);
  const signs = useMemo(() => [...bodySigns(gameContent), WEAPON_SIGN], []);
  const html = useMemo(
    () =>
      providers.length === 0
        ? ''
        : artSheet(
            providers,
            signs.filter((s) => only === '' || s.key === only),
            { label: signLabel },
          ),
    [providers, signs, only],
  );
  return (
    <section class="lab body-lab" data-testid="body-lab">
      <h2>Body Lab</h2>
      <div class="lab__controls">
        <span>Play with:</span>
        {ART_STYLES.map((s) => (
          <button
            key={s}
            type="button"
            class="btn"
            aria-pressed={artStyle.value === s}
            data-testid={`art-${s}`}
            onClick={() => void setArtStyle(s)}
          >
            {s}
          </button>
        ))}
        <label>
          Sign{' '}
          <select value={only} onChange={(e) => setOnly((e.target as HTMLSelectElement).value)}>
            <option value="">all</option>
            {signs.map((s) => (
              <option key={s.key} value={s.key}>
                {s.key}
              </option>
            ))}
          </select>
        </label>
      </div>
      <style>{SHEET_CSS}</style>
      <div class="body-lab__sheet" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}
