import type { Platform } from '../index';
import { shareWithFallback } from '../share';
import { openStore } from '../storage';

/** GitHub Pages build (PWA). */
export const platform: Platform = {
  kind: 'web',
  share: shareWithFallback,
  shareUrl: () => new URL(import.meta.env.BASE_URL, location.origin).href,
  openStore: () => openStore(),
};
