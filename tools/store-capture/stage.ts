import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Page } from '@playwright/test';

/*
 * Taking the store's pictures (docs/tech-spec.md §37). Each moment opens the game in a fresh browser with
 * the clock stopped at a set time and Math.random seeded, so the same souls come every time. Stills are
 * taken with everything at rest; clips a frame at a time, the game's timers and its animations stepped
 * together, however long a frame takes to shoot.
 */

export const repoRoot = resolve(import.meta.dirname, '../..');
/** CI's dry run: every moment played and shot, each clip cut to a frame per hold, in a folder of its own. */
export const CHECK = process.env.STORE_CHECK === '1';
export const OUT = resolve(repoRoot, CHECK ? 'dist/store-check' : 'dist/store');
/** Another art style to shoot (`?art=`), to compare: STORE_ART=pixel pnpm store:capture. */
export const ART = process.env.STORE_ART ?? '';
/** When the pictures are taken: Daily #41's day, as the e2e tests play it. */
export const DATE = new Date('2027-01-10T12:00:00Z');

export type Size = 'steam' | 'phone';

export function write(path: string, data: Uint8Array | string): void {
  const file = resolve(OUT, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}

/** Math.random from a seed (mulberry32 over the seed's FNV-1a hash): a new run's souls come from it. */
const seededRandom = (seed: string) => `(() => {
  let a = 2166136261;
  for (const c of ${JSON.stringify(seed)}) a = Math.imul(a ^ c.charCodeAt(0), 16777619);
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;

/** What a store picture leaves out: focus rings, the caret, and the "draft" label on the story's scenes. */
const CAPTURE_CSS = `
*:focus, *:focus-visible { outline: none !important; }
* { caret-color: transparent !important; }
[data-testid="scene-draft"] { display: none !important; }
`;

/** The capture's settings: no primer offer, telemetry question, lesson coach or sound. */
const SETTINGS = { v: 1, primerDone: true, telemetryAsked: true, coach: false, sound: 0 };

export interface OpenOptions {
  /** Seeds Math.random, which picks a new run's or a practice's souls. */
  readonly seed?: string;
  /** A campaign save for the first slot. */
  readonly save?: unknown;
}

/** Runs the game's clock on: its timers fire, its sun moves, frames are drawn. */
export async function wait(page: Page, ms: number): Promise<void> {
  await page.clock.runFor(ms);
}

/** Opens the title screen, stopped at DATE, with the capture's settings and the given save. */
export async function open(page: Page, o: OpenOptions = {}): Promise<void> {
  await page.clock.install({ time: DATE.getTime() - 1000 });
  await page.clock.pauseAt(DATE);
  await page.addInitScript(seededRandom(o.seed ?? 'store'));
  const save = o.save === undefined ? null : JSON.stringify({ v: 1, rev: 1, savedAt: 0, save: o.save });
  await page.addInitScript(
    ([settings, record]) => {
      // Once per tab: a reload keeps what the game has saved since.
      if (sessionStorage.getItem('store-capture') !== null) return;
      sessionStorage.setItem('store-capture', '1');
      localStorage.setItem('cots.settings', settings);
      if (record !== null) localStorage.setItem('cots.campaign.0', record);
    },
    [JSON.stringify(SETTINGS), save] as const,
  );
  await page.goto(ART ? `./?art=${encodeURIComponent(ART)}` : './');
  await page.addStyleTag({ content: CAPTURE_CSS });
  await wait(page, 500);
}

const SHOT = { animations: 'disabled', caret: 'hide' } as const;

/**
 * Runs the clock on until no toast or achievement notice is showing: they come and go by themselves (2.6 s, and
 * 4 s plus 1 s for each achievement), and a store picture is about what's under them.
 */
export async function quiet(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const shown = await page.locator('.toast, [data-testid="achievement-note"]').count();
    if (shown === 0) return;
    await wait(page, 500);
  }
  throw new Error('A toast or notice stayed up for 20 seconds');
}

/**
 * A still: from the desk, Steam's PNG and a JPEG for Google Play's landscape shots; from the phone, Play's
 * portrait JPEG (Play takes no alpha, and a JPEG has none).
 */
export async function shot(page: Page, id: string, size: Size): Promise<void> {
  await page.evaluate('document.fonts.ready');
  await quiet(page);
  await wait(page, 100);
  if (size === 'steam') {
    write(`steam/${id}.png`, await page.screenshot(SHOT));
    write(`play-landscape/${id}.jpg`, await page.screenshot({ ...SHOT, type: 'jpeg', quality: 92 }));
  } else {
    write(`play-phone/${id}.jpg`, await page.screenshot({ ...SHOT, type: 'jpeg', quality: 92 }));
  }
}

/**
 * Brings every animation to rest before a clip starts: those started while the moment was set up ran on the
 * browser's own clock, so where they'd be would differ from run to run.
 */
const SETTLE = `for (const a of document.getAnimations()) {
  const end = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
  if (end === Infinity) { a.pause(); a.currentTime = 0; } else a.finish();
}`;

/**
 * Moves every animation on by one frame, by hand. Each is paused when first seen and started from 0, then
 * set frame by frame; one past its end is finished, so whatever waits on it (a soul walking off) goes on.
 */
const STEP = `(dt) => {
  const seen = (window.__storeFrames ??= new Map());
  for (const a of document.getAnimations()) {
    let t = seen.get(a);
    if (t === undefined) { a.pause(); a.currentTime = 0; t = 0; } else t += dt;
    const end = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
    if (t >= end) { seen.delete(a); a.finish(); } else { seen.set(a, t); a.currentTime = t; }
  }
}`;

/** The box round these elements, in the frame's own pixels. */
const boxOf = (selectors: readonly string[]) => `(() => {
  const rects = ${JSON.stringify(selectors)}.flatMap((s) => [...document.querySelectorAll(s)].map((e) => e.getBoundingClientRect()));
  const d = devicePixelRatio;
  const W = Math.round(innerWidth * d), H = Math.round(innerHeight * d);
  if (rects.length === 0) return { x: 0, y: 0, w: W, h: H, frameW: W, frameH: H };
  const x = Math.max(0, Math.floor(Math.min(...rects.map((r) => r.left)) * d));
  const y = Math.max(0, Math.floor(Math.min(...rects.map((r) => r.top)) * d));
  const r = Math.min(W, Math.ceil(Math.max(...rects.map((r) => r.right)) * d));
  const b = Math.min(H, Math.ceil(Math.max(...rects.map((r) => r.bottom)) * d));
  return { x, y, w: r - x, h: b - y, frameW: W, frameH: H };
})()`;

export interface ClipInfo {
  readonly id: string;
  readonly fps: number;
  readonly frames: number;
  readonly width: number;
  readonly height: number;
  /** What the GIF keeps of each frame. */
  readonly crop: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
}

/** A clip, shot a frame at a time into clips/<id>/frames, with clips/<id>/clip.json saying how. */
export class Clip {
  private frames = 0;
  private crop: ClipInfo['crop'] = { x: 0, y: 0, w: 0, h: 0 };
  private size = { width: 0, height: 0 };

  constructor(
    private readonly page: Page,
    readonly id: string,
    readonly fps = 30,
  ) {}

  /** Starts with everything at rest; the GIF keeps the box round `crop` (all of it, without). */
  async start(crop: readonly string[] = []): Promise<void> {
    await this.page.evaluate('document.fonts.ready');
    await quiet(this.page);
    await this.page.evaluate(SETTLE);
    const box = await this.page.evaluate<{
      x: number;
      y: number;
      w: number;
      h: number;
      frameW: number;
      frameH: number;
    }>(boxOf(crop));
    this.crop = { x: box.x, y: box.y, w: box.w, h: box.h };
    this.size = { width: box.frameW, height: box.frameH };
  }

  /** `ms` of play, a frame at a time; the game's clock runs `speed` times as fast (1 plays; more is a time-lapse). */
  async hold(ms: number, speed = 1): Promise<void> {
    const n = Math.max(1, Math.round((ms * this.fps) / 1000));
    // In the dry run, the same time passes in one step and one frame is shot.
    const steps = CHECK ? 1 : n;
    for (let i = 0; i < steps; i++) {
      const end = Math.round(((i + 1) * ms) / steps);
      const start = Math.round((i * ms) / steps);
      await this.page.clock.runFor(Math.round(end * speed) - Math.round(start * speed));
      await this.page.evaluate(`(${STEP})(${end - start})`);
      this.frames += 1;
      write(
        `clips/${this.id}/frames/${String(this.frames).padStart(4, '0')}.png`,
        await this.page.screenshot({ caret: 'hide' }),
      );
    }
  }

  /** Writes clip.json, for the step that makes the GIF and the video. */
  done(): void {
    const info: ClipInfo = { id: this.id, fps: this.fps, frames: this.frames, ...this.size, crop: this.crop };
    write(`clips/${this.id}/clip.json`, `${JSON.stringify(info, null, 2)}\n`);
  }
}
