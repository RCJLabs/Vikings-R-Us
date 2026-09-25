import { sound as built } from 'virtual:content';
import { sunElapsed } from '@cots/engine';
import { computed, effect, signal } from '@preact/signals';
import { holdAudio, type Sound, setCueSource, whenSoundRuns } from '../audio';
import { now, type Screen, screen, session, settings } from '../store';
import { createBedPlayer, createCues, type Loader, loadFile } from './beds';
import { type Mix, mixFor } from './mix';
import { campaignPlace, storyOnScreen } from './place';
import type { SoundBook } from './types';

/*
 * Keeps the sound in step with the game (docs/tech-spec.md §39): the mix for where the player is, worked out
 * again whenever that changes (the sun, while a shift runs), and the recorded cues where there are any. A build
 * with no music or ambience files plays none; the dev build can put sketches in their place (`?sound=sketch`).
 */

/** The sound in use: the build's own, or the dev build's sketches. */
export const book = signal<SoundBook>(built);

/** Whether there's music or ambience to set a volume for: the settings offer it only then. */
export const hasBeds = computed(() => Object.keys(book.value.beds).length > 0);

/** The campaign's own screens: on these (and on a campaign shift) its day and ending choose the bed. */
const CAMPAIGN_SCREENS: ReadonlySet<Screen> = new Set(['morning', 'audit', 'night', 'ending']);

/** The mix last worked out, for the dev build's tests. */
const lastMix = signal<Mix | null>(null);

export function startSound(): () => void {
  let load: Loader = loadFile;
  // The sketches are for the dev build only: the check is replaced as other builds are made, and they drop it.
  if (import.meta.env.MODE === 'dev-full' && new URLSearchParams(location.search).get('sound') === 'sketch') {
    void import('./sketch').then((m) => {
      load = (layer, ctx) => (m.isSketch(layer) ? m.loadSketch(layer, ctx) : loadFile(layer, ctx));
      book.value = m.sketchBook;
    });
  }
  const player = createBedPlayer(
    () => book.peek(),
    (layer, ctx) => load(layer, ctx),
  );
  const cues = createCues(
    () => book.peek(),
    (layer, ctx) => load(layer, ctx),
  );
  setCueSource((cue: Sound) => cues.next(cue));
  const stopRuns = whenSoundRuns(() => cues.preload());

  const stopMix = effect(() => {
    const where = screen.value;
    const st = where === 'shift' ? session.value?.state : undefined;
    // A pause holds all sound, and leaving the shift from the pause lets it go.
    holdAudio(st?.phase === 'shift' && st.clock.pausedAt !== null);
    if (!hasBeds.value) return;
    const place = campaignPlace.value;
    const campaign = CAMPAIGN_SCREENS.has(where) || st?.config.mode === 'campaign';
    // The sun is read only while one runs, so other screens aren't worked out again at every tick.
    const sunUsed = st && !st.config.untimed && st.sunMs > 0 ? sunElapsed(st, now.value) / st.sunMs : null;
    const mix = mixFor(
      {
        screen: where,
        day: campaign ? (place?.day ?? null) : null,
        ending: where === 'ending' ? (place?.ending ?? null) : null,
        sunUsed,
        story: storyOnScreen.value > 0,
      },
      book.value,
      { music: settings.value.music, ambience: settings.value.ambience },
    );
    lastMix.value = mix;
    player.apply(mix);
  });

  if (import.meta.env.MODE === 'dev-full') {
    (globalThis as { __cotsSound?: unknown }).__cotsSound = { mix: () => lastMix.peek(), heard: () => player.heard() };
  }

  return () => {
    stopMix();
    stopRuns();
    setCueSource(null);
    player.stop();
  };
}
