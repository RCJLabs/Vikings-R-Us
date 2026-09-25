/**
 * The store capture's second half (docs/tech-spec.md §37), after capture.spec.ts has shot everything:
 * - makes each clip's GIF (15 fps, cropped to the action, no wider than a store page shows it) and, where
 *   ffmpeg is on the PATH, an H.264 MP4 of its full frames;
 * - checks every file is there and meets its store's rules;
 * - writes manifest.json and the contact sheet, index.html.
 * It fails on a missing file or one a store would refuse.
 *
 * Usage (after the capture): tsx tools/store-capture/finish.ts; STORE_CHECK=1 for CI's dry run.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import gifenc from 'gifenc';
import { PNG } from 'pngjs';
import { CLIPS, STILLS } from './catalog';
import { checkImage, cropRgba, gifSize, imageInfo, MINIMUM, resizeRgba, type StoreSet } from './images';
import { type ClipEntry, contactSheet, type FileEntry, type Manifest } from './sheet';
import { ART, CHECK, type ClipInfo, OUT, repoRoot } from './stage';

const GIF_FPS = 15;
/** Frames the clip's one palette is taken from, spread across it. */
const PALETTE_SAMPLES = 8;

function entry(set: StoreSet, id: string, path: string, title: string, note: string): FileEntry {
  const file = resolve(OUT, path);
  if (!existsSync(file)) {
    return { set, id, path, title, note, width: 0, height: 0, bytes: 0, errors: ['missing'], warnings: [] };
  }
  const bytes = readFileSync(file);
  const info = imageInfo(bytes);
  const { errors, warnings } = checkImage(set, info, bytes.length);
  return {
    set,
    id,
    path,
    title,
    note,
    width: info?.width ?? 0,
    height: info?.height ?? 0,
    bytes: bytes.length,
    errors,
    warnings,
  };
}

const frameFile = (id: string, n: number) => resolve(OUT, `clips/${id}/frames/${String(n).padStart(4, '0')}.png`);

/** A frame, cropped to the clip's box and shrunk to the GIF's size. */
function gifFrame(info: ClipInfo, n: number, size: { width: number; height: number }): Uint8Array {
  const png = PNG.sync.read(readFileSync(frameFile(info.id, n)));
  const rgba = new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length);
  const cropped = cropRgba(rgba, png.width, info.crop);
  return resizeRgba(cropped, info.crop.w, info.crop.h, size.width, size.height);
}

/**
 * One palette for the whole clip, from frames across it, so what stays still doesn't flicker between frames;
 * then every other frame (15 of the 30 a second), looping.
 */
function makeGif(info: ClipInfo): Uint8Array {
  const size = gifSize(info.crop.w, info.crop.h);
  const step = Math.max(1, Math.round(info.fps / GIF_FPS));
  const picks = Array.from({ length: Math.ceil(info.frames / step) }, (_, i) => 1 + i * step);
  const samples = picks.filter((_, i) => i % Math.max(1, Math.floor(picks.length / PALETTE_SAMPLES)) === 0);
  const sampled = samples.map((n) => gifFrame(info, n, size));
  const all = new Uint8Array(sampled.reduce((sum, f) => sum + f.length, 0));
  sampled.reduce((at, f) => {
    all.set(f, at);
    return at + f.length;
  }, 0);
  const palette = gifenc.quantize(all, 256);
  const gif = gifenc.GIFEncoder();
  const delay = Math.round((1000 * step) / info.fps);
  picks.forEach((n, i) => {
    const index = gifenc.applyPalette(gifFrame(info, n, size), palette);
    gif.writeFrame(index, size.width, size.height, i === 0 ? { palette, delay, repeat: 0 } : { delay });
  });
  gif.finish();
  return gif.bytes();
}

const hasFfmpeg = () => spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

/** The full frames as an H.264 MP4, the format video editors and Steam's trailer upload take. */
function makeMp4(info: ClipInfo): string | undefined {
  const out = `clips/${info.id}.mp4`;
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      String(info.fps),
      '-i',
      resolve(OUT, `clips/${info.id}/frames/%04d.png`),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '16',
      '-preset',
      'slow',
      '-movflags',
      '+faststart',
      resolve(OUT, out),
    ],
    { stdio: 'inherit' },
  );
  return r.status === 0 ? out : undefined;
}

function commit(): string | undefined {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : undefined;
}

const files: FileEntry[] = [];
for (const s of STILLS) {
  if (s.sizes.includes('steam')) {
    files.push(entry('steam', s.id, `steam/${s.id}.png`, s.title, s.note));
    files.push(entry('play-landscape', s.id, `play-landscape/${s.id}.jpg`, s.title, s.note));
  }
  if (s.sizes.includes('phone')) files.push(entry('play-phone', s.id, `play-phone/${s.id}.jpg`, s.title, s.note));
}

const ffmpeg = !CHECK && hasFfmpeg();
const clips: ClipEntry[] = [];
for (const c of CLIPS) {
  const json = resolve(OUT, `clips/${c.id}/clip.json`);
  if (!existsSync(json)) {
    const gif = entry('gif', c.id, `clips/${c.id}.gif`, c.title, c.note);
    clips.push({ id: c.id, title: c.title, note: c.note, fps: 0, frames: 0, gif });
    continue;
  }
  const info = JSON.parse(readFileSync(json, 'utf8')) as ClipInfo;
  writeFileSync(resolve(OUT, `clips/${c.id}.gif`), makeGif(info));
  const mp4 = ffmpeg ? makeMp4(info) : undefined;
  const gif = entry('gif', c.id, `clips/${c.id}.gif`, c.title, c.note);
  clips.push({
    id: c.id,
    title: c.title,
    note: c.note,
    fps: info.fps,
    frames: info.frames,
    gif,
    ...(mp4 ? { mp4 } : {}),
  });
}

const notes: string[] = [];
for (const [set, min] of Object.entries(MINIMUM)) {
  const n = files.filter((f) => f.set === set && f.errors.length === 0).length;
  if (min && n < min.n) notes.push(`${n} ${set} shots: ${min.why}`);
}
if (!CHECK && !ffmpeg) notes.push('No ffmpeg on the PATH, so no MP4s: the frames are there for any video editor.');

const manifest: Manifest = {
  taken: new Date().toISOString().slice(0, 16).replace('T', ' '),
  build: 'electron-full',
  art: ART || 'the default (woodcut)',
  ...(commit() ? { commit: commit() } : {}),
  check: CHECK,
  files,
  clips,
  notes,
};
writeFileSync(resolve(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(resolve(OUT, 'index.html'), contactSheet(manifest));

const everything = [...files, ...clips.map((c) => c.gif)];
const failed = everything.filter((f) => f.errors.length > 0);
for (const f of everything) {
  for (const e of f.errors) console.error(`✗ ${f.path}: ${e}`);
  for (const w of f.warnings) console.warn(`! ${f.path}: ${w}`);
}
for (const n of notes) console.warn(`! ${n}`);
const mp4s = clips.filter((c) => c.mp4).length;
console.log(
  `store capture: ${files.length} stills, ${clips.length} clips (${mp4s} MP4) in ${OUT.replace(`${repoRoot}/`, '')}; contact sheet index.html`,
);
if (statSync(OUT).isDirectory() && failed.length > 0) {
  console.error(`store capture: ${failed.length} file(s) missing or refused`);
  process.exit(1);
}
