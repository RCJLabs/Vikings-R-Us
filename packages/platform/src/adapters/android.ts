import type { Platform } from '../index';
import { shareWithFallback } from '../share';
import { openStore } from '../storage';

/** Google Play build. Native share, haptics, Filesystem saves and the back button arrive with the Capacitor shell in M9. */
export const platform: Platform = {
  kind: 'android',
  share: shareWithFallback,
  shareUrl: () => undefined,
  openStore: () => openStore(),
};
