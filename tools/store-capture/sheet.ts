import type { StoreSet } from './images';

/*
 * The contact sheet (docs/tech-spec.md §37): every picture the capture took, with what it shows, its size, and
 * what the stores' rules make of it. One HTML page that works opened from dist/store and published as it is.
 */

export interface FileEntry {
  readonly set: StoreSet;
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly note: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface ClipEntry {
  readonly id: string;
  readonly title: string;
  readonly note: string;
  readonly fps: number;
  readonly frames: number;
  readonly gif: FileEntry;
  /** The H.264 video, when ffmpeg was there to make it. */
  readonly mp4?: string;
}

export interface Manifest {
  readonly taken: string;
  readonly build: string;
  readonly art: string;
  readonly commit?: string;
  readonly check: boolean;
  readonly files: readonly FileEntry[];
  readonly clips: readonly ClipEntry[];
  /** Problems with the set as a whole (too few of something). */
  readonly notes: readonly string[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const kb = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

const SETS: readonly { readonly set: StoreSet; readonly title: string; readonly about: string }[] = [
  {
    set: 'steam',
    title: 'Steam screenshots',
    about: 'PNG, 1920×1080. Steam asks for at least five, of the game being played.',
  },
  {
    set: 'play-phone',
    title: 'Google Play: phone',
    about: 'JPEG (no alpha), 1080×1920, 9:16. A game counts for promotion with three or more.',
  },
  {
    set: 'play-landscape',
    title: 'Google Play: landscape',
    about: 'The Steam shots again as JPEG, 1920×1080, 16:9, for tablets and landscape listings.',
  },
];

function verdict(f: FileEntry): string {
  const lines = [
    ...f.errors.map((e) => `<li class="bad">${esc(e)}</li>`),
    ...f.warnings.map((w) => `<li class="warn">${esc(w)}</li>`),
  ];
  return lines.length > 0 ? `<ul class="checks">${lines.join('')}</ul>` : '<p class="ok">Meets the store’s rules</p>';
}

function figure(f: FileEntry): string {
  return `<figure class="shot shot--${f.set}">
  <a href="${esc(f.path)}"><img src="${esc(f.path)}" width="${f.width}" height="${f.height}" loading="lazy" alt="${esc(f.title)}"></a>
  <figcaption>
    <h3>${esc(f.title)}</h3>
    <p>${esc(f.note)}</p>
    <p class="meta"><code>${esc(f.path)}</code> · ${f.width}×${f.height} · ${kb(f.bytes)}</p>
    ${verdict(f)}
  </figcaption>
</figure>`;
}

function clipFigure(c: ClipEntry): string {
  const video = c.mp4 ? ` · <a href="${esc(c.mp4)}">MP4 video</a>` : '';
  return `<figure class="shot shot--clip">
  <img src="${esc(c.gif.path)}" width="${c.gif.width}" height="${c.gif.height}" loading="lazy" alt="${esc(c.title)}">
  <figcaption>
    <h3>${esc(c.title)}</h3>
    <p>${esc(c.note)}</p>
    <p class="meta"><code>${esc(c.gif.path)}</code> · ${c.gif.width}×${c.gif.height} · ${kb(c.gif.bytes)}${video}</p>
    <p class="meta">${c.frames} frames at ${c.fps} fps, 1920×1080 PNG, in <code>clips/${esc(c.id)}/frames</code></p>
    ${verdict(c.gif)}
  </figcaption>
</figure>`;
}

export function contactSheet(m: Manifest): string {
  const errors = [...m.files, ...m.clips.map((c) => c.gif)].filter((f) => f.errors.length > 0).length;
  const summary =
    errors > 0
      ? `<p class="status bad">${errors} file${errors === 1 ? '' : 's'} the stores would refuse: see below.</p>`
      : '<p class="status ok">Every file meets its store’s rules.</p>';
  const notes =
    m.notes.length > 0
      ? `<ul class="checks">${m.notes.map((n) => `<li class="warn">${esc(n)}</li>`).join('')}</ul>`
      : '';
  const sections = SETS.map(({ set, title, about }) => {
    const files = m.files.filter((f) => f.set === set);
    if (files.length === 0) return '';
    return `<section>
  <h2>${esc(title)} <span class="count">${files.length}</span></h2>
  <p class="about">${esc(about)}</p>
  <div class="grid grid--${set}">${files.map(figure).join('\n')}</div>
</section>`;
  }).join('\n');
  const clips =
    m.clips.length === 0
      ? ''
      : `<section>
  <h2>Clips <span class="count">${m.clips.length}</span></h2>
  <p class="about">GIFs at 15 fps for the store page’s description, cropped to the action. The full frames are for editing a trailer.</p>
  <div class="grid grid--clip">${m.clips.map(clipFigure).join('\n')}</div>
</section>`;
  return `<title>Chooser store captures</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root {
  --bg: #f6f1e7;
  --panel: #fffaf0;
  --ink: #2a2118;
  --muted: #6b5d4b;
  --line: #e2d6c1;
  --accent: #8a5a12;
  --ok: #2f6b3a;
  --warn: #8a5a00;
  --bad: #a3261d;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #17130f;
    --panel: #221c16;
    --ink: #efe6d6;
    --muted: #b3a48d;
    --line: #3a3027;
    --accent: #d8ae62;
    --ok: #7fc28b;
    --warn: #e0b35a;
    --bad: #f08a80;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #17130f;
  --panel: #221c16;
  --ink: #efe6d6;
  --muted: #b3a48d;
  --line: #3a3027;
  --accent: #d8ae62;
  --ok: #7fc28b;
  --warn: #e0b35a;
  --bad: #f08a80;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 2rem 16px 4rem;
  background: var(--bg);
  color: var(--ink);
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
}
main { max-width: 1280px; margin: 0 auto; display: grid; gap: 2.5rem; }
h1, h2, h3 { font-family: Georgia, "Iowan Old Style", "Times New Roman", serif; text-wrap: balance; margin: 0; }
h1 { font-size: 2rem; }
h2 { font-size: 1.4rem; display: flex; align-items: baseline; gap: 0.6rem; }
h3 { font-size: 1.05rem; }
header { display: grid; gap: 0.5rem; }
header p { margin: 0; max-width: 70ch; }
.count { font: 600 0.8rem/1 system-ui, sans-serif; color: var(--muted); letter-spacing: 0.04em; }
.about, .meta { color: var(--muted); margin: 0; }
.meta { font-size: 0.85rem; font-variant-numeric: tabular-nums; }
code { font: 0.85em ui-monospace, SFMono-Regular, Menlo, monospace; }
a { color: var(--accent); }
section { display: grid; gap: 0.75rem; }
.grid { display: grid; gap: 1.25rem; }
.grid--steam, .grid--play-landscape { grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); }
.grid--play-phone { grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr)); }
.grid--clip { grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); }
.shot { margin: 0; display: grid; gap: 0.5rem; align-content: start; }
.shot img { display: block; width: 100%; height: auto; max-width: 100%; border-radius: 6px; border: 1px solid var(--line); background: var(--panel); }
figcaption { display: grid; gap: 0.25rem; }
figcaption p { margin: 0; }
.checks { margin: 0; padding-left: 1.1rem; font-size: 0.85rem; }
.ok { color: var(--ok); font-size: 0.85rem; margin: 0; }
.warn { color: var(--warn); }
.bad { color: var(--bad); }
.status { font-weight: 600; }
</style>
<main>
<header>
  <h1>Store captures</h1>
  <p>Chooser of the Slain, from the <code>${esc(m.build)}</code> build${m.commit ? ` at <code>${esc(m.commit)}</code>` : ''}, art: ${esc(m.art)}. Taken ${esc(m.taken)}${m.check ? ' (a dry run: clips cut short)' : ''}.</p>
  <p>Every moment is played the same way each time, on the same souls: <code>pnpm store:capture</code> takes them all again after any change to the art or the game.</p>
  ${summary}
  ${notes}
</header>
${sections}
${clips}
</main>
`;
}
