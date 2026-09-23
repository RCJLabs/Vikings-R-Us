import type { Platform } from '../index';
import { shareWithFallback } from '../share';

/** Steam build. Native saves, achievements and Steam Cloud arrive with the Electron shell in M6. */
export const platform: Platform = { kind: 'electron', share: shareWithFallback };
