/**
 * The art comparison sheet (docs/build-plan.md M5, the art decision): every
 * body sign drawn by every art provider at the size a 360x740 phone shows the
 * body and through a 3x loupe, plus whole souls, thumbnails and portraits, as
 * one standalone HTML page.
 *
 * Usage: pnpm art:sheet [--out dist/art-sheet/index.html] [--art placeholder,woodcut,pixel]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ART_STYLES, type BodyArtProvider, type BodyScene } from '@cots/art';
import { artSheet, bodySigns, SHEET_CSS, type Sign, SMALL_PHONE } from '@cots/art/sheet';
import type { Value } from '@cots/engine';
import { loadContent } from '@cots/testkit';

const repoRoot = resolve(import.meta.dirname, '../..');
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const out = resolve(repoRoot, arg('out', 'dist/art-sheet/index.html'));
const styles = arg('art', ART_STYLES.join(','))
  .split(',')
  .filter((s) => (ART_STYLES as readonly string[]).includes(s));

const content = loadContent('dev-full');
const strings: Record<string, string> = {};
for (const pack of ['core', 'daily', 'demo', 'campaign']) {
  Object.assign(
    strings,
    JSON.parse(readFileSync(resolve(repoRoot, `generated/dev-full/strings.${pack}.en.json`), 'utf8')),
  );
}

/** The chip text, without the message formatter: plural counts and names are filled in plainly. */
function label(sign: Sign, value: Value): string {
  if (sign.kind === 'cue') return value ? (strings[`cue.${sign.key}`] ?? sign.key) : `(no ${sign.key})`;
  if (typeof value === 'number') return `${sign.key} = ${value}`;
  const text = strings[`obs.${sign.key}.${String(value)}`] ?? `${sign.key}: ${String(value)}`;
  return text.replace(/\{name\}/g, 'Toki').replace(/\{other\}/g, 'Hrafn');
}

const soul = (over: Partial<BodyScene> & { obs?: Record<string, Value> }): BodyScene => ({
  view: 'front',
  look: { gender: 'm', name: 'Toki', patronym: 'Ulfsson', age: 34, build: 'broad', beard: 'short' },
  cues: [],
  tools: [],
  ...over,
  obs: {
    grip: 'weapon',
    gripHand: 'right',
    woundsFront: 0,
    skin: 'normal',
    lips: 'normal',
    hair: 'dark',
    ornament: 'none',
    woundsBack: 0,
    breath: 'still',
    ...over.obs,
  },
});

const SOULS: BodyScene[] = [
  soul({
    look: { gender: 'm', name: 'Bjorn', patronym: 'Arason', age: 41, build: 'heavy', beard: 'braided' },
    obs: { hair: 'red', woundsFront: 2 },
  }),
  soul({
    look: { gender: 'f', name: 'Gudrun', patronym: 'Ketilsdottir', age: 66, build: 'lean', beard: 'none' },
    obs: { grip: 'none', hair: 'grey', skin: 'feverFlush', ornament: 'amber' },
  }),
  soul({
    look: { gender: 'm', name: 'Orm', patronym: 'Hakonarson', age: 28, build: 'lean', beard: 'long' },
    obs: { hair: 'fair', lips: 'seaFoam', ornament: 'silver', gripHand: 'left' },
  }),
  soul({ view: 'back', obs: { woundsBack: 1, hair: 'fair' } }),
  soul({
    look: { gender: 'f', name: 'Thora', patronym: 'Eiriksdottir', age: 30, build: 'broad', beard: 'none' },
    obs: { nails: true, hair: 'dark', inscription: 'other', makersMark: 'markCopy' },
    cues: ['wrongGrip'],
    tools: ['runeLens'],
  }),
  soul({ obs: { breath: 'stirs', hair: 'dark' }, cues: ['breathFog'], tools: ['feather'] }),
];

const providers: BodyArtProvider[] = [];
for (const style of styles) {
  const mod = (await import(`@cots/art${style === 'placeholder' ? '' : `/${style}`}`)) as Record<string, unknown>;
  const provider = Object.values(mod).find(
    (v): v is BodyArtProvider => typeof v === 'object' && v !== null && (v as BodyArtProvider).id === style,
  );
  if (!provider) throw new Error(`no provider "${style}"`);
  providers.push(provider);
}

const body = artSheet(providers, bodySigns(content), { label, souls: SOULS, screen: SMALL_PHONE });
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Art Comparison</title>
<style>
:root { --bg: #f4ecda; --fg: #241c14; --sheet-muted: #6b5f4f; --sheet-line: #d8ccb4; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, sans-serif; }
h1 { font-size: 1.4rem; margin: 0 0 0.5rem; }
${SHEET_CSS}
</style></head><body>
<h1>Art comparison: ${providers.map((p) => p.id).join(' · ')}</h1>
<p class="sheet__note">Each sign at the size a ${SMALL_PHONE.name} shows the body (${SMALL_PHONE.stageW}x${SMALL_PHONE.stageH} stage at ${SMALL_PHONE.dpr}x), then through a 3x loupe.</p>
${body}
</body></html>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`art-sheet: ${providers.map((p) => p.id).join(', ')} -> ${out} (${(html.length / 1024).toFixed(0)} KB)`);
