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
}
