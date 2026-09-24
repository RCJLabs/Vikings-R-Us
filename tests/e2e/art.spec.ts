import { expect, type Page, test } from '@playwright/test';
import { FULL } from './urls';

/*
 * The art directions under trial (M5): `?art=` switches the body art and is
 * remembered on the device; pixel art is scaled in whole device pixels; the
 * dev build's Body Lab switches it too.
 */

/** A Day 1 practice shift (unlike the Daily, it can be started again and again). */
async function openShift(page: Page, query = '') {
  await page.goto(`./${query}`);
  await page.getByTestId('practice-1').click();
  await page.getByTestId('begin').click();
}

test('?art= picks the body art, and the choice is remembered', async ({ page }) => {
  await openShift(page, '?art=woodcut');
  await expect(page.locator('.stage')).toHaveAttribute('data-art', 'woodcut');
  await expect(page.locator('.hotspot').first()).toBeVisible();

  await openShift(page);
  await expect(page.locator('.stage')).toHaveAttribute('data-art', 'woodcut');

  await openShift(page, '?art=placeholder');
  await expect(page.locator('.stage')).toHaveAttribute('data-art', 'placeholder');
  await openShift(page);
  await expect(page.locator('.stage')).toHaveAttribute('data-art', 'placeholder');
});

test('pixel art is scaled in whole device pixels', async ({ page }) => {
  await openShift(page, '?art=pixel');
  await expect(page.locator('.stage')).toHaveAttribute('data-art', 'pixel');
  const dpr = await page.evaluate(() => (globalThis as unknown as { devicePixelRatio: number }).devicePixelRatio);
  const box = await page
    .locator('.stage__frame')
    .evaluate((el) => el.getBoundingClientRect().toJSON() as { width: number; height: number });
  const scale = { x: (box.width * dpr) / 100, y: (box.height * dpr) / 140 };
  expect(scale.x).toBeGreaterThanOrEqual(1);
  expect(Math.abs(scale.x - Math.round(scale.x))).toBeLessThan(0.02);
  expect(Math.abs(scale.y - Math.round(scale.y))).toBeLessThan(0.02);
  // Hotspots still sit over the body: tapping the face region reveals a face sign.
  await page.locator('.stage .hotspot[data-region="face"]').click();
  await expect(page.locator('.clues')).toContainText(/skin|lips|Pale|Dry|Fever|Sea-foam/i);
});

test.describe('the Body Lab', () => {
  test.use({ baseURL: FULL });

  test('draws every provider and switches the art the game plays with', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'a desk tool');
    await page.goto('./?art=placeholder');
    const lab = page.getByTestId('body-lab');
    await expect(lab.locator('#sign-nails .sheet__row')).toHaveCount(3);
    await lab.getByTestId('art-pixel').click();
    await expect(lab.getByTestId('art-pixel')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('practice-1').click();
    await page.getByTestId('begin').click();
    await expect(page.locator('.stage')).toHaveAttribute('data-art', 'pixel');
  });
});

test.describe('a landscape phone', () => {
  test.use({ viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  test('shows the body down the side at full height, with the tools clear of it', async ({ page }, info) => {
    test.skip(info.project.name === 'desktop', 'the viewport is set here; one run is enough');
    await page.goto('./?art=placeholder');
    await page.getByTestId('practice-3').click();
    await page.getByTestId('begin').click();
    const frame = await page.locator('.stage__frame').boundingBox();
    expect(frame?.height ?? 0).toBeGreaterThan(250);
    const right = (frame?.x ?? 0) + (frame?.width ?? 0);
    const tools = await page
      .locator('.stage .btn--tool')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
    expect(tools.length).toBeGreaterThan(0);
    for (const left of tools) expect(left).toBeGreaterThanOrEqual(right);
  });
});
