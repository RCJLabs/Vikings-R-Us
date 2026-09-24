import { describe, expect, it } from 'vitest';
import { skyBackground, skyColors } from './sky';

/*
 * The sky over the desk (docs/tech-spec.md §33): it goes down with the sun, and the desk's text stays
 * readable on it at every hour.
 */

type Rgb = readonly [number, number, number];

/** WCAG relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

// The stylesheet's --ink, --muted and --accent.
const TEXT: Record<string, Rgb> = { ink: [239, 230, 210], muted: [184, 170, 140], accent: [200, 169, 106] };
const hours = Array.from({ length: 21 }, (_, i) => 1 - i / 20);

describe('the sky', () => {
  it('goes down with the sun: darker at every step from dawn to dusk', () => {
    const tops = hours.map((d) => luminance(skyColors(d).top));
    for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeLessThanOrEqual(tops[i - 1] as number);
    expect(tops[0]).toBeGreaterThan(2 * (tops.at(-1) as number));
    // Outside the day it stays at its ends.
    expect(skyColors(1.5)).toEqual(skyColors(1));
    expect(skyColors(-1)).toEqual(skyColors(0));
  });

  it('keeps the text on it readable (4.5:1) at every hour', () => {
    for (const d of hours) {
      const { top, low } = skyColors(d);
      for (const [name, text] of Object.entries(TEXT)) {
        expect(contrast(text, top), `${name} on the sky at ${d}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(text, low), `${name} low on the sky at ${d}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('changes its style only when the daylight moves a hundredth', () => {
    expect(skyBackground(0.501)).toBe(skyBackground(0.499));
    expect(skyBackground(1)).not.toBe(skyBackground(0.5));
    expect(skyBackground(1)).toMatch(/^linear-gradient\(to bottom, rgb\(\d+ \d+ \d+\), rgb\(\d+ \d+ \d+\) 70%\)$/);
  });
});
