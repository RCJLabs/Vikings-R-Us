/*
 * The sky over the desk goes down with the sun (docs/tech-spec.md §33): warm while it's high, rose as it
 * sinks, deep blue at dusk. Pure, so a test can hold it to its promises.
 */

type Rgb = readonly [number, number, number];

interface Sky {
  readonly top: Rgb;
  readonly low: Rgb;
}

/**
 * The sky over the desk: warm while the sun is high, rose as it sinks (at a third of the day left), deep blue
 * at dusk. Every colour keeps the desk's text (ink, muted, accent) at 4.5:1 or better (sky.test.ts).
 */
const DAY: Sky = { top: [76, 58, 31], low: [34, 27, 19] };
const SUNSET: Sky = { top: [80, 40, 53], low: [30, 20, 22] };
const DUSK: Sky = { top: [30, 22, 50], low: [18, 14, 24] };
const SUNSET_AT = 0.35;

const mix = (a: Rgb, b: Rgb, k: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * k),
  Math.round(a[1] + (b[1] - a[1]) * k),
  Math.round(a[2] + (b[2] - a[2]) * k),
];

const between = (a: Sky, b: Sky, k: number): Sky => ({ top: mix(a.top, b.top, k), low: mix(a.low, b.low, k) });

/**
 * The sky's two colours, top and bottom, for the daylight left (1 at dawn, 0 at dusk). Dark enough behind
 * the desk's light text at every point; the body's stage and the papers keep their own backgrounds, so the
 * signs stay as easy to see as the art promises.
 */
export function skyColors(daylight: number): Sky {
  const d = Math.min(1, Math.max(0, daylight));
  return d <= SUNSET_AT
    ? between(DUSK, SUNSET, d / SUNSET_AT)
    : between(SUNSET, DAY, (d - SUNSET_AT) / (1 - SUNSET_AT));
}

const rgb = (c: Rgb) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

/** The sky as a CSS background. Daylight is rounded to a hundredth, so the style changes only when it shows. */
export function skyBackground(daylight: number): string {
  const { top, low } = skyColors(Math.round(daylight * 100) / 100);
  return `linear-gradient(to bottom, ${rgb(top)}, ${rgb(low)} 70%)`;
}
