import { expect, test } from '@playwright/test';

/*
 * Placeholder sound (M5): a shift with sound on plays without errors, and
 * the volume setting is kept.
 */

test('a shift with sound on raises no errors, and the volume setting is kept', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('./');
  await page.locator('.card--settings summary').click();
  await page.getByTestId('setting-sound').fill('0.3');

  await page.getByTestId('practice-2').click();
  await page.getByTestId('begin').click();
  await page.locator('.stage .hotspot').first().click();
  await page.getByTestId('flip').click();
  if ((await page.locator('.shift--drawer').count()) > 0) await page.getByTestId('judge').click();
  await page.locator('[data-dest="HEL"]').click();
  await page.getByTestId('send').click();

  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cots.settings') ?? '{}') as { sound?: number },
  );
  expect(saved.sound).toBe(0.3);
  expect(errors).toEqual([]);
});
