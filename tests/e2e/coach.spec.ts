import { expect, type Page, test } from '@playwright/test';
import { FULL } from './urls';

/*
 * The coach's lessons (audit item 7), in the full game's practice: each day's
 * first soul teaches what's new that day, once per device. Day 6 is the
 * registry: its first soul is always an oathbreaker bound for Hel.
 */

test.use({ baseURL: FULL });

const drawer = async (page: Page) => (await page.locator('.shift--drawer').count()) > 0;

async function practice(page: Page, day: number) {
  await page.goto('./');
  await page.getByTestId(`practice-${day}`).click();
  await page.getByTestId('begin').click();
  await expect(page.getByTestId('soul-count')).toContainText('Soul 1 of');
}

test('a day’s first soul teaches what’s new, step by step, and only once', async ({ page }) => {
  await practice(page, 6);
  const coach = page.getByTestId('coach');
  await expect(coach).toContainText('New today: the registry of outlaws and oathbreakers.');
  await expect(page.locator('.shift')).toHaveAttribute('data-coach', 'registry');
  await page.getByTestId('registry').click();
  await expect(coach).toContainText('Their name is in it.');
  await expect(page.locator('.shift')).toHaveAttribute('data-coach', 'judge');
  if (await drawer(page)) await page.getByTestId('judge').click();
  await page.locator('[data-dest="HEL"]').click();
  await page.getByTestId('send').click();
  await expect(page.getByTestId('soul-count')).toContainText('Soul 2 of');
  await expect(coach).toHaveCount(0);

  // Taught: the next practice of Day 6 starts without the lesson.
  await practice(page, 6);
  await expect(page.getByTestId('coach')).toHaveCount(0);
});

test('a lesson can be skipped, and the coach turned off', async ({ page }) => {
  await practice(page, 8);
  await expect(page.getByTestId('coach')).toContainText("Naglfar is built from dead men's nails.");
  await page.getByTestId('coach-skip').click();
  await expect(page.getByTestId('coach')).toHaveCount(0);
  await practice(page, 8);
  await expect(page.getByTestId('coach')).toHaveCount(0);

  await page.goto('./');
  await page.locator('.card--settings summary').click();
  await page.getByTestId('setting-coach').uncheck();
  await practice(page, 7);
  await expect(page.getByTestId('coach')).toHaveCount(0);
});
