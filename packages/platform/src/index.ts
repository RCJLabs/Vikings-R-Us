import type { KeyValueStore } from './storage';

export type PlatformKind = 'web' | 'itch' | 'electron' | 'android';
export type ShareResult = 'shared' | 'copied' | 'failed';

/**
 * Everything that differs between web, itch, Steam and Google Play. Each build
 * target resolves `@platform` to one adapter at build time, so web bundles
 * contain no Electron or Capacitor code (docs/tech-spec.md §8.0).
 */
export interface Platform {
  readonly kind: PlatformKind;
  share(text: string, url?: string): Promise<ShareResult>;
  /** Where a shared result should point players, if this build has a public page. */
  shareUrl(): string | undefined;
  /** Opens the build's store: the shared one, or one of its own by `name` (docs/tech-spec.md §38). */
  openStore(name?: string): Promise<KeyValueStore>;
  /**
   * Calls `ready` when a new version is downloaded and waiting (PWA only).
   * Returns a function that installs it and reloads; the UI only offers that
   * on the title screen, never mid-shift.
   */
  watchForUpdate(ready: () => void): () => Promise<void>;
  /**
   * Tells the platform an achievement is earned (docs/tech-spec.md §34), by the game's id; the adapter maps
   * it to the platform's own (Google Play makes up its own ids). Called when one is earned, and again for
   * every one earned on each start, so it must take the same id twice without harm. The web builds keep
   * achievements only in the game.
   */
  unlockAchievement(id: string): void;
}

export { copyText, noAchievements, noUpdates, shareWithFallback } from './share';
export { isPersisted, type KeyValueStore, memoryStore, openStore, requestPersistence } from './storage';
