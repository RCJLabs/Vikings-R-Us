/**
 * Renders the PWA icons from apps/web/public/icons/icon.svg with the local
 * Chromium. Run with `pnpm icons` after changing the SVG; the PNGs are committed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const dir = resolve(import.meta.dirname, '../../apps/web/public/icons');
const svg = readFileSync(resolve(dir, 'icon.svg'), 'utf8');
// Maskable icons need a full-bleed square; the ring already sits inside the 80% safe zone.
const maskable = svg.replace('rx="96"', 'rx="0"');

const browser = await chromium.launch();
for (const [name, size, source] of [
  ['icon-192.png', 192, svg],
  ['icon-512.png', 512, svg],
  ['icon-512-maskable.png', 512, maskable],
] as const) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: resolve(dir, name), omitBackground: true });
  await page.close();
  console.log(`icons: wrote ${name}`);
}
await browser.close();
