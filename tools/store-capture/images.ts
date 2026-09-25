/*
 * The store files, read and checked (docs/tech-spec.md §37): each file's own header gives its kind and size,
 * checked against what Steam and Google Play take; and the pixel work a GIF needs (a crop, then a shrink).
 * Pure, so it's tested without a browser.
 */

export interface ImageInfo {
  readonly format: 'png' | 'jpeg' | 'gif';
  readonly width: number;
  readonly height: number;
  /** An alpha channel, or a transparent colour: Google Play refuses either. */
  readonly alpha: boolean;
}

const be16 = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const be32 = (b: Uint8Array, i: number) => ((be16(b, i) << 16) >>> 0) + be16(b, i + 2);
const le16 = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngInfo(b: Uint8Array): ImageInfo | null {
  if (ascii(b, 12, 4) !== 'IHDR') return null;
  // Colour types 4 and 6 carry alpha; a tRNS chunk makes a colour transparent.
  let alpha = b[25] === 4 || b[25] === 6;
  for (let i = 8; i + 8 <= b.length; ) {
    const type = ascii(b, i + 4, 4);
    if (type === 'tRNS') alpha = true;
    if (type === 'IDAT' || type === 'IEND') break;
    i += 12 + be32(b, i);
  }
  return { format: 'png', width: be32(b, 16), height: be32(b, 20), alpha };
}

/** A JPEG's size is in its start-of-frame segment, after however many others. */
function jpegInfo(b: Uint8Array): ImageInfo | null {
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] ?? 0;
    // Start of frame: every SOFn but DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { format: 'jpeg', width: be16(b, i + 7), height: be16(b, i + 5), alpha: false };
    }
    i += 2 + be16(b, i + 2);
  }
  return null;
}

export function imageInfo(b: Uint8Array): ImageInfo | null {
  if (PNG_SIGNATURE.every((v, i) => b[i] === v)) return pngInfo(b);
  if (b[0] === 0xff && b[1] === 0xd8) return jpegInfo(b);
  const gif = ascii(b, 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') {
    return { format: 'gif', width: le16(b, 6), height: le16(b, 8), alpha: false };
  }
  return null;
}

/** What each set of files is for. */
export type StoreSet = 'steam' | 'play-landscape' | 'play-phone' | 'gif';

export interface Verdict {
  /** What the store would refuse. */
  readonly errors: readonly string[];
  /** What's allowed but worth a look. */
  readonly warnings: readonly string[];
}

/** A GIF for the store page's description is shown about this wide; wider only costs bytes. */
export const GIF_WIDTH = 640;
/** Past this, a GIF is slow to load on a store page (a judgement, not a store rule). */
export const GIF_BYTES = 5 * 1024 * 1024;

/**
 * One file against its store's rules, as Steamworks' and the Play Console's own pages give them
 * (docs/tech-spec.md §37):
 * - Steam: screenshots are 1280×720 or 1920×1080.
 * - Google Play: JPEG or 24-bit PNG without alpha; each side 320–3840 px; the long side at most twice the short.
 *   A game's shots count for promotion as 16:9 at 1920×1080 or more, or 9:16 at 1080×1920 or more.
 */
export function checkImage(set: StoreSet, info: ImageInfo | null, bytes: number): Verdict {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!info) return { errors: ['not a PNG, JPEG or GIF'], warnings };
  const { format, width: w, height: h } = info;
  const size = `${w}×${h}`;
  if (set === 'steam') {
    if (format === 'gif') errors.push('Steam screenshots are PNG or JPEG');
    if (!((w === 1920 && h === 1080) || (w === 1280 && h === 720))) {
      errors.push(`Steam screenshots are 1920×1080 or 1280×720, not ${size}`);
    }
  } else if (set === 'play-landscape' || set === 'play-phone') {
    if (format === 'gif') errors.push('Google Play screenshots are JPEG or PNG');
    if (info.alpha) errors.push('Google Play refuses screenshots with alpha');
    const short = Math.min(w, h);
    const long = Math.max(w, h);
    if (short < 320 || long > 3840) errors.push(`each side must be 320–3840 px, not ${size}`);
    if (long > 2 * short) errors.push(`the long side is more than twice the short (${size})`);
    const promoted = set === 'play-landscape' ? w * 9 === h * 16 && w >= 1920 : w * 16 === h * 9 && w >= 1080;
    if (!promoted) {
      warnings.push(
        set === 'play-landscape'
          ? `games' landscape shots count for promotion at 16:9, 1920×1080 or more (this is ${size})`
          : `games' portrait shots count for promotion at 9:16, 1080×1920 or more (this is ${size})`,
      );
    }
  } else {
    if (format !== 'gif') errors.push('not a GIF');
    if (w > GIF_WIDTH) warnings.push(`${w} px wide; a store page shows about ${GIF_WIDTH}`);
    if (bytes > GIF_BYTES) warnings.push(`${(bytes / 1024 / 1024).toFixed(1)} MB; slow to load on a store page`);
  }
  return { errors, warnings };
}

/** How many of each a store listing needs. */
export const MINIMUM: Readonly<Partial<Record<StoreSet, { readonly n: number; readonly why: string }>>> = {
  steam: { n: 5, why: 'Steam asks for at least 5 screenshots' },
  'play-landscape': { n: 3, why: "a game's listing needs 3 landscape or 3 portrait shots for promotion" },
  'play-phone': { n: 3, why: "a game's listing needs 3 landscape or 3 portrait shots for promotion" },
};

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Part of an RGBA image. */
export function cropRgba(src: Uint8Array, width: number, box: Box): Uint8Array {
  const out = new Uint8Array(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const from = ((box.y + y) * width + box.x) * 4;
    out.set(src.subarray(from, from + box.w * 4), y * box.w * 4);
  }
  return out;
}

/** Where each output pixel of a row (or column) `n` long, made `m` long, takes its source pixels from, and how much of each. */
function spans(n: number, m: number): { readonly from: number; readonly weights: readonly number[] }[] {
  const scale = n / m;
  return Array.from({ length: m }, (_, o) => {
    const a = o * scale;
    const b = a + scale;
    const from = Math.floor(a);
    const weights: number[] = [];
    for (let i = from; i < b && i < n; i++) weights.push((Math.min(b, i + 1) - Math.max(a, i)) / scale);
    return { from, weights };
  });
}

/**
 * An RGBA image made smaller, each output pixel the average of the source area it covers (area averaging:
 * the sharpest shrink with no ringing, at any ratio). Rows first, then columns.
 */
export function resizeRgba(src: Uint8Array, width: number, height: number, w: number, h: number): Uint8Array {
  const across = spans(width, w);
  const rows = new Float32Array(w * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < w; x++) {
      const { from, weights } = across[x] ?? { from: 0, weights: [] };
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        weights.forEach((wt, k) => {
          sum += wt * (src[(y * width + from + k) * 4 + c] ?? 0);
        });
        rows[(y * w + x) * 4 + c] = sum;
      }
    }
  }
  const down = spans(height, h);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const { from, weights } = down[y] ?? { from: 0, weights: [] };
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        weights.forEach((wt, k) => {
          sum += wt * (rows[((from + k) * w + x) * 4 + c] ?? 0);
        });
        out[(y * w + x) * 4 + c] = Math.round(sum);
      }
    }
  }
  return out;
}

/** A GIF's size for a crop: no wider than GIF_WIDTH, never enlarged, the crop's shape kept. */
export function gifSize(w: number, h: number): { readonly width: number; readonly height: number } {
  const width = Math.min(w, GIF_WIDTH);
  return { width, height: Math.max(1, Math.round((h * width) / w)) };
}
