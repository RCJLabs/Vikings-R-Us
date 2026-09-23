import type { Platform } from '../index';
import { shareWithFallback } from '../share';

/** GitHub Pages build (PWA). */
export const platform: Platform = { kind: 'web', share: shareWithFallback };
