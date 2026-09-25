import { expect, type Page, test } from '@playwright/test';
import { FULL } from './urls';

/*
 * Music and ambience (docs/tech-spec.md §39), heard through the dev build's sketches (`?sound=sketch`), since
 * no build has real sound files yet. The dev build lets a test read what the mix wants and what each layer is
 * actually at, from `__cotsSound`. The public builds have neither the sketches nor that.
 */

interface Layer {
  readonly level: number;
  readonly target: number;
  readonly playing: boolean;
}
interface Heard {
  readonly running: boolean;
  readonly bed: string | null;
  readonly layers: Readonly<Record<string, Layer | undefined>>;
}
interface Mix {
  readonly bed: string;
  readonly music: number;
  readonly tension: number;
  readonly ambience: number;
}

/** What's playing: null until the game has set up its sound, just after it first draws. */
const heard = (page: Page) => page.evaluate<Heard | null>('globalThis.__cotsSound?.heard() ?? null');
const mix = (page: Page) => page.evaluate<Mix | null>('globalThis.__cotsSound?.mix() ?? null');

/** A layer's level once it has had time to reach what the mix wants. */
async function settled(page: Page, layer: string): Promise<number> {
  await expect
    .poll(async () => {
      const l = (await heard(page))?.layers[layer];
      return l ? Math.abs(l.level - l.target) : 1;
    })
    .toBeLessThan(0.02);
  return (await heard(page))?.layers[layer]?.level ?? -1;
}

async function openWithSketches(page: Page) {
  await page.clock.install();
  await page.goto('./?sound=sketch');
  await expect(page.getByTestId('play-campaign')).toBeVisible();
  // Sound starts on the first tap after the game is listening for one (it sets up its sound and its listeners
  // together, just after it first draws; a tap before that starts nothing, and the next one does).
  await expect.poll(() => page.evaluate('typeof globalThis.__cotsSound')).toBe('object');
  await page.mouse.click(2, 2);
  await expect.poll(async () => (await heard(page))?.bed).toBe('title');
}

test.describe('with sketches in the dev build', () => {
  test.use({ baseURL: FULL });

  test('each place has its bed, the tension rises as the sun sinks, and a pause holds it all', async ({ page }) => {
    await openWithSketches(page);
    expect((await heard(page))?.running).toBe(true);
    expect(await settled(page, 'music')).toBeCloseTo(0.7, 1);

    await page.getByTestId('practice-1').click();
    await page.getByTestId('begin').click();
    await expect.poll(async () => (await heard(page))?.bed).toBe('gate');
    await expect
      .poll(async () => Object.keys((await heard(page))?.layers ?? {}).sort())
      .toEqual(['ambience', 'music', 'tension']);
    expect(await mix(page)).toMatchObject({ bed: 'gate', tension: 0 });
    expect(await settled(page, 'tension')).toBeLessThan(0.02);

    // Late in the day: the tension layer has risen and the calm music given way to it.
    await page.clock.fastForward('05:00');
    await expect.poll(async () => (await mix(page))?.tension ?? 0).toBeGreaterThan(0.3);
    expect(await settled(page, 'tension')).toBeGreaterThan(0.3);
    const late = await mix(page);
    expect(late?.music).toBeLessThan(0.7);

    // A pause holds all sound; leaving from the pause lets it go, to the title's bed.
    await page.getByTestId('pause').click();
    await expect.poll(async () => (await heard(page))?.running).toBe(false);
    await page.getByTestId('leave-shift').click();
    await expect.poll(async () => (await heard(page))?.running).toBe(true);
    await expect.poll(async () => (await heard(page))?.bed).toBe('title');
  });

  test('the music and ambience drop under a story scene, and the settings set their volumes', async ({ page }) => {
    await openWithSketches(page);
    await page.locator('.card--settings summary').click();
    await page.getByTestId('setting-music').fill('0.5');
    await expect.poll(async () => (await mix(page))?.music).toBe(0.5);

    await page.getByTestId('play-campaign').click();
    await page.getByTestId('new-0').click();
    await expect(page.getByTestId('scene')).toBeVisible();
    await expect.poll(async () => (await heard(page))?.bed).toBe('morning');
    // Under story text: music to 0.4 of its volume, ambience to 0.55.
    await expect.poll(async () => (await mix(page))?.music).toBeCloseTo(0.5 * 0.4, 3);
    expect((await mix(page))?.ambience).toBeCloseTo(0.8 * 0.55, 3);
    expect(await settled(page, 'music')).toBeCloseTo(0.2, 1);

    while ((await page.getByTestId('scene-done').count()) === 0) await page.getByTestId('scene-choice').first().click();
    await page.getByTestId('scene-done').click();
    await expect(page.getByTestId('scene')).toHaveCount(0);
    await expect.poll(async () => (await mix(page))?.music).toBe(0.5);
    expect((await mix(page))?.ambience).toBe(0.8);
  });

  test('without sketches the dev build has no sound files, so it plays no beds and offers no music volume', async ({
    page,
  }) => {
    await page.goto('./');
    await page.locator('.card--settings summary').click();
    await expect(page.getByTestId('setting-sound')).toBeVisible();
    await expect(page.getByTestId('setting-music')).toHaveCount(0);
    await expect.poll(() => page.evaluate('typeof globalThis.__cotsSound')).toBe('object');
    await page.mouse.click(2, 2);
    await expect.poll(async () => (await heard(page))?.running).toBe(true);
    expect(await mix(page)).toBeNull();
    expect((await heard(page))?.bed).toBeNull();
  });
});

test('the web demo has no sketches and no way to ask for them', async ({ page }) => {
  await page.goto('./?sound=sketch');
  await page.locator('.card--settings summary').click();
  await expect(page.getByTestId('setting-sound')).toBeVisible();
  await expect(page.getByTestId('setting-music')).toHaveCount(0);
  expect(await page.evaluate('typeof globalThis.__cotsSound')).toBe('undefined');
});
