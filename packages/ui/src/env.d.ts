/** Compiled content for the current build target (see apps/web/vite.config.ts). */
declare module 'virtual:content' {
  export const manifest: {
    readonly target: string;
    readonly edition: 'demo' | 'full';
    readonly lab: boolean;
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
}
