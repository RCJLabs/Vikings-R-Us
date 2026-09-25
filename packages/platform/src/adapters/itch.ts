import type { Platform } from '../index';
import { noAchievements, noUpdates, shareWithFallback } from '../share';
import { openStore } from '../storage';

/**
 * itch.io build: embedded in an iframe on another origin, no service worker.
 * The iframe's own URL isn't the game page, so shares carry no link until the
 * itch page exists; copying falls back to a textarea when the clipboard API is blocked.
 */
export const platform: Platform = {
  kind: 'itch',
  share: shareWithFallback,
  shareUrl: () => undefined,
  openStore: (name) => openStore(name),
  watchForUpdate: noUpdates,
  unlockAchievement: noAchievements,
};
