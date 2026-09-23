import type { Platform } from '../index';
import { shareWithFallback } from '../share';

/** Google Play build. Native share, haptics and back-button handling arrive with the Capacitor shell in M9. */
export const platform: Platform = { kind: 'android', share: shareWithFallback };
