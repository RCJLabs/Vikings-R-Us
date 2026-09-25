/** Compiled content for the current build target (see apps/web/vite.config.ts). */
declare module 'virtual:content' {
  export const manifest: {
    readonly target: string;
    readonly edition: 'demo' | 'full';
    readonly lab: boolean;
    /** A build for invited playtesters (docs/playtest.md). */
    readonly playtest: boolean;
    /** The build's own name for what it keeps in a browser, or null where it keeps things with the other builds. */
    readonly storage: string | null;
    readonly packs: readonly string[];
    readonly canaries: readonly string[];
    readonly contentHash: string;
  };
  export const strings: Readonly<Record<string, string>>;
  export const gameContent: import('@cots/engine').Content;
  /** Core + daily packs only, so a Daily plays the same in every build. */
  export const dailyContent: import('@cots/engine').Content | null;
  /** Checksums every Daily should have, for the runtime guard. */
  export const dailyChecks: import('@cots/engine').DailyChecks | null;
  /** Compiled Ink scenes by id, for the days this build ships; a separate chunk loaded on first use. */
  export function loadScenes(): Promise<Readonly<Record<string, object>>>;
}
