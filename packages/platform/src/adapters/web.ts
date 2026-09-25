import { registerSW } from 'virtual:pwa-register';
import type { Platform } from '../index';
import { noAchievements, shareWithFallback } from '../share';
import { openStore } from '../storage';

/** GitHub Pages build (PWA). Updates wait for the player (registerType: 'prompt'). */
export const platform: Platform = {
  kind: 'web',
  share: shareWithFallback,
  shareUrl: () => new URL(import.meta.env.BASE_URL, location.origin).href,
  openStore: (name) => openStore(name),
  watchForUpdate: (ready) => registerSW({ onNeedRefresh: ready }),
  unlockAchievement: noAchievements,
};
