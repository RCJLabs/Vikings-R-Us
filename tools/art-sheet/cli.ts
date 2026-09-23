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
import { artSheet, bodySigns, fitFrame, type Screen, SHEET_CSS, type Sign, SMALL_PHONE } from '@cots/art/sheet';
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

const signs = bodySigns(content);
const body = artSheet(providers, signs, { label, souls: SOULS, screen: SMALL_PHONE });

/** Body stages measured in the web demo's shift screen (M5): CSS pixels and the device pixel ratio. */
const SCREENS: readonly Screen[] = [
  { name: '360x740 phone', stageW: 360, stageH: 232, dpr: 3 },
  { name: '390x844 phone', stageW: 390, stageH: 267, dpr: 3 },
  { name: '412x915 phone', stageW: 412, stageH: 326, dpr: 2.625 },
  { name: '740x360 phone, landscape', stageW: 740, stageH: 103, dpr: 3 },
  { name: '1280x800 (Steam Deck)', stageW: 479, stageH: 528, dpr: 1 },
  { name: '1920x1080 desktop', stageW: 731, stageH: 858, dpr: 1 },
];
const pixel = providers.find((p) => p.frame.grid);
const smooth = providers.find((p) => !p.frame.grid);
const size = (p: BodyArtProvider | undefined, screen: Screen) => {
  if (!p) return '-';
  const f = fitFrame(p.frame, screen);
  return `${Math.round(f.w)} x ${Math.round(f.h)}`;
};

// The page is published as it is: the viewer adds the document skeleton, so there's no html/head/body here.
const html = `<title>Chooser Art Trial</title>
<style>
:root {
  color-scheme: dark;
  --bg: #15110d; --panel: #221b14; --ink: #efe6d2; --muted: #b8aa8c; --accent: #c8a96a; --line: #3a2f24;
  --sheet-muted: var(--muted); --sheet-line: var(--line);
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    color-scheme: light;
    --bg: #f1ebdf; --panel: #e6dccb; --ink: #241b12; --muted: #6b5c45; --accent: #7d5b1f; --line: #d3c6ad;
  }
}
:root[data-theme="light"] {
  color-scheme: light;
  --bg: #f1ebdf; --panel: #e6dccb; --ink: #241b12; --muted: #6b5c45; --accent: #7d5b1f; --line: #d3c6ad;
}
body { background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.page { max-width: 72rem; margin: 0 auto; padding-inline: 16px; padding-block: 20px 48px; }
h1 { font-size: 1.6rem; line-height: 1.2; margin: 0 0 0.4rem; text-wrap: balance; }
h2 { font-size: 1.15rem; margin: 0 0 0.5rem; text-wrap: balance; }
p { max-width: 65ch; margin: 0 0 0.75rem; }
a { color: var(--accent); }
a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.lede { color: var(--muted); }
.mono, .sheet__sign h2 small { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.8rem; font-variant-numeric: tabular-nums; }
.brief { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 1rem; margin: 1.25rem 0 1.5rem; }
.brief section { background: var(--panel); border-radius: 8px; padding: 0.9rem 1rem; }
.brief h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.brief ul { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.4rem; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; font-variant-numeric: tabular-nums; font-size: 0.9rem; }
th, td { text-align: left; padding: 0.3rem 0.8rem 0.3rem 0; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--muted); font-weight: 600; }
.jump { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 1; background: var(--bg); border-bottom: 1px solid var(--line); margin: 0 -16px 1.25rem; padding: 0.5rem 16px; overflow-x: auto; white-space: nowrap; }
.jump a { display: inline-block; margin-right: 0.4rem; padding: 0.2rem 0.6rem; border: 1px solid var(--line); border-radius: 999px; text-decoration: none; font-size: 0.85rem; color: var(--ink); }
.sheet__souls h2, .sheet__sign h2 { color: var(--ink); }
.sheet__row h3 { color: var(--accent); text-transform: capitalize; }
.sheet__cells figcaption { color: var(--muted); }
${SHEET_CSS}
</style>
<div class="page">
<h1>Chooser of the Slain: art trial</h1>
<p class="lede">Two candidate art directions, woodcut and pixel, next to the placeholder. Every body sign is drawn at the size a ${SMALL_PHONE.name} shows the body (the stage is ${SMALL_PHONE.stageW}x${SMALL_PHONE.stageH} CSS px at ${SMALL_PHONE.dpr}x), then through a 3x loupe. The question for each sign: could you tell the values apart at that size?</p>
<div class="brief">
<section>
<h2>Measured</h2>
<ul>
<li>Every current sign reads at phone size in all three styles, except the feather. "Stirs" against "lies still" was weak everywhere. The candidates now add air lines beside the head; the placeholder still has the weak version.</li>
<li>Pixel art is scaled in whole device pixels, so on a 360x740 phone it shrinks to 133x187, about 20% smaller than the smooth styles.</li>
<li>On a landscape phone the body is about 74x103 in any style. That is a layout problem to fix in M5, whatever you choose.</li>
<li>The soul's words name a spear or a sword while every style draws an axe. The writing pass will make them agree.</li>
</ul>
</section>
<section>
<h2>Not here yet</h2>
<ul>
<li>Day 10's pendants (hammer, cross, both) and Day 12's stitched lips, the subtlest sign in the game (salience 1). They arrive with those days, and they are where the styles should differ most.</li>
<li>How each style looks in motion, on a stream or as store art. Judge that from the whole souls below and from playing a shift with <span class="mono">?art=woodcut</span> or <span class="mono">?art=pixel</span>.</li>
</ul>
</section>
<section>
<h2>Cost, estimated</h2>
<ul>
<li>Woodcut is vector: one drawing serves every screen size and can be reused for store capsules. New souls are recoloured parts.</li>
<li>Pixel art has to be drawn for its grid, and larger art (capsules, trailers) needs separate drawings. Palette swaps make recolours cheap.</li>
<li>Both prototypes are drawn in code by me. An artist's quote per direction is the real cost figure.</li>
</ul>
</section>
</div>
<h2>Body size by screen</h2>
<div class="table-wrap"><table>
<thead><tr><th>Screen</th><th>Pixel ratio</th><th>Woodcut, placeholder</th><th>Pixel (whole pixels)</th></tr></thead>
<tbody>${SCREENS.map((sc) => `<tr><td>${sc.name}</td><td>${sc.dpr}x</td><td>${size(smooth, sc)}</td><td>${size(pixel, sc)}</td></tr>`).join('')}</tbody>
</table></div>
<p class="lede">CSS pixels, from the shift screen's body stage on each screen.</p>
<nav class="jump" aria-label="Signs"><a href="#souls">Whole souls</a>${signs.map((s) => `<a href="#sign-${s.key}">${s.key}</a>`).join('')}</nav>
<div id="souls"></div>
${body}
</div>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`art-sheet: ${providers.map((p) => p.id).join(', ')} -> ${out} (${(html.length / 1024).toFixed(0)} KB)`);
