import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { checkImage, cropRgba, GIF_BYTES, gifSize, imageInfo, resizeRgba } from './images';

/** A real PNG of this size, with or without an alpha channel. */
function png(width: number, height: number, alpha: boolean): Uint8Array {
  const img = new PNG({ width, height, colorType: alpha ? 6 : 2, inputHasAlpha: true });
  img.data.fill(200);
  return new Uint8Array(PNG.sync.write(img, { colorType: alpha ? 6 : 2 }));
}

/** The start of a baseline JPEG: SOI, an APP0 segment, then SOF0 with this size. */
function jpeg(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...Array.from({ length: 14 }, () => 0)];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 8, height >> 8, height & 255, width >> 8, width & 255, 3];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, ...Array.from({ length: 9 }, () => 0)]);
}

function gif(width: number, height: number): Uint8Array {
  return new Uint8Array(
    [...'GIF89a'].map((c) => c.charCodeAt(0)).concat([width & 255, width >> 8, height & 255, height >> 8]),
  );
}

describe('reading a file for its size and kind', () => {
  it('reads PNGs, and whether they carry alpha', () => {
    expect(imageInfo(png(16, 9, false))).toEqual({ format: 'png', width: 16, height: 9, alpha: false });
    expect(imageInfo(png(16, 9, true))?.alpha).toBe(true);
  });

  it('reads a JPEG past the segments before its frame, and a GIF', () => {
    expect(imageInfo(jpeg(1080, 1920))).toEqual({ format: 'jpeg', width: 1080, height: 1920, alpha: false });
    expect(imageInfo(gif(640, 360))).toEqual({ format: 'gif', width: 640, height: 360, alpha: false });
  });

  it("doesn't take anything else for an image", () => {
    expect(imageInfo(new TextEncoder().encode('<html></html>'))).toBeNull();
    expect(checkImage('steam', null, 0).errors).toEqual(['not a PNG, JPEG or GIF']);
  });
});

describe('the stores’ rules', () => {
  const info = (format: 'png' | 'jpeg' | 'gif', width: number, height: number, alpha = false) => ({
    format,
    width,
    height,
    alpha,
  });

  it('takes Steam screenshots at 1920×1080 or 1280×720 only', () => {
    expect(checkImage('steam', info('png', 1920, 1080), 0).errors).toEqual([]);
    expect(checkImage('steam', info('jpeg', 1280, 720), 0).errors).toEqual([]);
    expect(checkImage('steam', info('png', 1920, 1200), 0).errors).toHaveLength(1);
  });

  it('refuses Play shots with alpha, a side out of range, or a long side over twice the short', () => {
    expect(checkImage('play-phone', info('jpeg', 1080, 1920), 0)).toEqual({ errors: [], warnings: [] });
    expect(checkImage('play-phone', info('png', 1080, 1920, true), 0).errors).toEqual([
      'Google Play refuses screenshots with alpha',
    ]);
    expect(checkImage('play-phone', info('jpeg', 300, 600), 0).errors).toHaveLength(1);
    expect(checkImage('play-phone', info('jpeg', 1000, 2100), 0).errors).toEqual([
      'the long side is more than twice the short (1000×2100)',
    ]);
  });

  it("warns when a Play shot won't count for a game's promotion", () => {
    expect(checkImage('play-landscape', info('jpeg', 1920, 1080), 0).warnings).toEqual([]);
    expect(checkImage('play-landscape', info('jpeg', 1280, 720), 0).warnings).toHaveLength(1);
    expect(checkImage('play-phone', info('jpeg', 720, 1280), 0).warnings).toHaveLength(1);
  });

  it('warns of a GIF too wide or too heavy for a store page', () => {
    expect(checkImage('gif', info('gif', 640, 360), 1000)).toEqual({ errors: [], warnings: [] });
    expect(checkImage('gif', info('gif', 960, 540), GIF_BYTES + 1).warnings).toHaveLength(2);
  });
});

describe('cropping and shrinking frames for a GIF', () => {
  // 4×2, each pixel's red its index, the rest 0 and opaque.
  const src = new Uint8Array(Array.from({ length: 8 }, (_, i) => [i * 10, 0, 0, 255]).flat());

  it('crops a box out of an image', () => {
    const out = cropRgba(src, 4, { x: 1, y: 0, w: 2, h: 2 });
    expect([...out].filter((_, i) => i % 4 === 0)).toEqual([10, 20, 50, 60]);
  });

  it('shrinks by a whole factor, each pixel the average of those it stands for', () => {
    expect([...resizeRgba(src, 4, 2, 2, 1)]).toEqual([25, 0, 0, 255, 45, 0, 0, 255]);
  });

  it('shrinks by any ratio, weighing each source pixel by how much of it an output pixel covers', () => {
    // A row of 3 made 2: the middle pixel is shared half and half.
    const row = new Uint8Array([0, 0, 0, 255, 90, 0, 0, 255, 180, 0, 0, 255]);
    expect([...resizeRgba(row, 3, 1, 2, 1)]).toEqual([30, 0, 0, 255, 150, 0, 0, 255]);
  });

  it('sizes a GIF no wider than a store page shows, and never enlarges one', () => {
    expect(gifSize(1309, 946)).toEqual({ width: 640, height: 463 });
    expect(gifSize(1920, 1080)).toEqual({ width: 640, height: 360 });
    expect(gifSize(400, 300)).toEqual({ width: 400, height: 300 });
  });
});
