import type { Platform } from '../index';
import { shareWithFallback } from '../share';
import { openStore } from '../storage';

/** Steam build. File saves via the main process, achievements and Steam Cloud arrive with the Electron shell in M6. */
export const platform: Platform = {
  kind: 'electron',
  share: shareWithFallback,
  shareUrl: () => undefined,
  openStore: () => openStore(),
};
