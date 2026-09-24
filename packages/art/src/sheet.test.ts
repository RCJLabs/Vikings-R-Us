import { loadContent } from '@cots/testkit';
import { describe, expect, it } from 'vitest';
import { pixelBody } from './pixel';
import { placeholderBody } from './placeholder';
import { artSheet, bodySigns, fitFrame, SMALL_PHONE, signScene } from './sheet';
import { woodcutBody } from './woodcut';

const content = loadContent('dev-full');

describe('the art comparison sheet', () => {
  it('covers every body sign and cue, and no document readings', () => {
    const keys = bodySigns(content).map((s) => s.key);
    for (const o of content.observations) expect(keys.includes(o.key), o.key).toBe(o.doc === undefined);
    for (const c of content.cues) expect(keys).toContain(c.key);
  });

  it('draws each value of each sign once per provider', () => {
    const signs = bodySigns(content).filter((s) => s.key === 'lips' || s.key === 'brokenRing');
    const html = artSheet([placeholderBody, woodcutBody], signs, { souls: [] });
    const figures = html.match(/<figure>/g)?.length ?? 0;
    const portraits = 2 * 4;
    expect(figures).toBe(portraits + 2 * signs.reduce((n, s) => n + s.values.length, 0));
    expect(html).toContain('id="sign-lips"');
  });

  it('shows a cue only when it is on, and a tool reading only with its tool', () => {
    const [fog] = bodySigns(content).filter((s) => s.key === 'breathFog');
    const [breath] = bodySigns(content).filter((s) => s.key === 'breath');
    expect(fog && signScene(fog, true).cues).toEqual(['breathFog']);
    expect(fog && signScene(fog, false).cues).toEqual([]);
    expect(breath && signScene(breath, 'stirs').tools).toEqual(['feather']);
  });
});

describe('fitting the body to a screen', () => {
  it('fills the stage height with smooth art', () => {
    const size = fitFrame(placeholderBody.frame, SMALL_PHONE);
    expect(size.h).toBeCloseTo(SMALL_PHONE.stageH);
    expect(size.w).toBeLessThanOrEqual(SMALL_PHONE.stageW);
  });

  it('scales pixel art in whole device pixels, letterboxed inside the stage', () => {
    for (const screen of [SMALL_PHONE, { name: 'desk', stageW: 479, stageH: 528, dpr: 1 }]) {
      const size = fitFrame(pixelBody.frame, screen);
      const cols = pixelBody.frame.w / (pixelBody.frame.grid ?? 1);
      const perPixel = (size.w * screen.dpr) / cols;
      expect(Number.isInteger(Math.round(perPixel * 1e9) / 1e9)).toBe(true);
      expect(size.w).toBeLessThanOrEqual(screen.stageW);
      expect(size.h).toBeLessThanOrEqual(screen.stageH);
    }
  });
});

describe('pixel art', () => {
  it('keeps every shape on its grid', () => {
    const grid = pixelBody.frame.grid ?? 0;
    expect(grid).toBeGreaterThan(1);
    const wounds = bodySigns(content).find((s) => s.key === 'woundsFront');
    if (!wounds) throw new Error('no woundsFront sign');
    const svg = pixelBody.draw(signScene(wounds, 2));
    const numbers = [...svg.matchAll(/ d="([^"]*)"/g)].flatMap((m) => (m[1] ?? '').match(/-?\d+(\.\d+)?/g) ?? []);
    expect(numbers.length).toBeGreaterThan(100);
    for (const n of numbers) expect(Math.abs(Number(n)) % grid, n).toBe(0);
    expect(svg).toContain('shape-rendering="crispEdges"');
  });
});
