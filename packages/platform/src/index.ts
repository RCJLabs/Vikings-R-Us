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
  openStore(): Promise<KeyValueStore>;
  /**
   * Calls `ready` when a new version is downloaded and waiting (PWA only).
   * Returns a function that installs it and reloads; the UI only offers that
   * on the title screen, never mid-shift.
   */
  watchForUpdate(ready: () => void): () => Promise<void>;
}

export { copyText, noUpdates, shareWithFallback } from './share';
export { type KeyValueStore, memoryStore, openStore, requestPersistence } from './storage';
