import type { Platform } from '../index';
import { noUpdates, shareWithFallback } from '../share';
import { openStore } from '../storage';

/**
 * Steam build. File saves via the main process, achievements, Steam Cloud and
 * opening links in the system browser arrive with the Electron shell in M6.
 */
export const platform: Platform = {
  kind: 'electron',
  share: shareWithFallback,
  shareUrl: () => undefined,
  openStore: () => openStore(),
  watchForUpdate: noUpdates,
};
