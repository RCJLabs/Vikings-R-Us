import type { Platform } from '../index';
import { shareWithFallback } from '../share';

/** itch.io build: embedded in an iframe, no service worker. A textarea copy fallback lands with the Daily share in M2. */
export const platform: Platform = { kind: 'itch', share: shareWithFallback };
