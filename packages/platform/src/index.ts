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
}
