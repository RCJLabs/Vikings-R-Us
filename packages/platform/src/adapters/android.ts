import type { Platform } from '../index';
import { noUpdates, shareWithFallback } from '../share';
import { openStore } from '../storage';

/**
 * Google Play build. Native share, haptics, Filesystem saves, the back button
 * and routing links to the system browser arrive with the Capacitor shell in M9.
 */
export const platform: Platform = {
  kind: 'android',
  share: shareWithFallback,
  shareUrl: () => undefined,
  openStore: () => openStore(),
  watchForUpdate: noUpdates,
};
