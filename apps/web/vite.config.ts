import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { isTargetId, PAGES_BASE, TARGET_IDS, TARGETS } from '../../packages/content-schema/src/targets.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../..');

/** Resolves `virtual:content` to this target's compiled content and nothing else. */
function contentPlugin(targetId: string): Plugin {
  const entry = resolve(repoRoot, 'generated', targetId, 'index.ts');
  return {
    name: 'cots-content',
    enforce: 'pre',
    resolveId(source) {
      if (source !== 'virtual:content') return null;
      if (!existsSync(entry)) {
        this.error(`No compiled content for "${targetId}". Run: pnpm content:compile --target ${targetId}`);
      }
      return entry;
    },
  };
}

// One config, six build targets: `vite build --mode <target>` (docs/build-plan.md §3).
export default defineConfig(({ mode }) => {
  if (!isTargetId(mode)) {
    throw new Error(`Unknown build target "${mode}". Use --mode <${TARGET_IDS.join('|')}>.`);
  }
  const target = TARGETS[mode];
  const base =
    target.base === 'pages' ? (process.env.COTS_BASE ?? PAGES_BASE) : target.base === 'relative' ? './' : '/';

  return {
    root: here,
    base,
    plugins: [
      contentPlugin(mode),
      preact(),
      target.pwa &&
        VitePWA({
          // Updates wait for the player; the prompt UI (title and night screens only) lands in M2.
          registerType: 'prompt',
          injectRegister: 'script-defer',
          manifest: {
            name: 'Chooser of the Slain (Demo)',
            short_name: 'Chooser',
            description: 'Judge the fallen before dusk. Free demo: the Daily Shift and the first three days.',
            theme_color: '#15110d',
            background_color: '#15110d',
            display: 'standalone',
            start_url: base,
            scope: base,
            icons: [
              { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          workbox: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'] },
        }),
    ],
    resolve: {
      alias: {
        '@platform': resolve(repoRoot, `packages/platform/src/adapters/${target.platform}.ts`),
      },
    },
    build: {
      outDir: resolve(repoRoot, 'dist', mode),
      emptyOutDir: true,
      // Public builds never ship source maps (they would expose unbundled source).
      sourcemap: target.lab,
      target: 'es2022',
    },
    server: { port: 5173 },
    preview: { port: 4173 },
  };
});
