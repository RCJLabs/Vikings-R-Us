import { dailySeed, startShift } from '@cots/engine';
import { loadDailyContent } from '@cots/testkit';
import { expect, type Page, test } from '@playwright/test';

/*
 * Skögul's hint (audit item 8), in the Daily: she points at a piece of what
 * decides the soul, for 15 seconds of sun, and once all of it has been seen
 * she has nothing left to show. Keyboard players ask with H.
 */

// Daily #41 (DAILY_EPOCH is 2026-12-01), in the browser's own timezone.
const DATE = new Date('2027-01-10T12:00:00Z');
const N = 41;
test.use({ timezoneId: 'UTC' });

const content = loadDailyContent();
const spec = content.daily;
if (!spec) throw new Error('No Daily in content');
const first = startShift(content, { mode: 'daily', seed: dailySeed(N), day: spec.day, dailyNumber: N }).state.cases[0];

const drawer = async (page: Page) => (await page.locator('.shift--drawer').count()) > 0;
const seconds = (text: string | null) => {
  const [m, s] = (text ?? '0:00').split(':').map(Number);
  return (m ?? 0) * 60 + (s ?? 0);
};

async function lookAtEverything(page: Page) {
  const look = page.locator('.chip--look');
  while ((await look.count()) > 0) await look.first().click();
}

test('Skögul points at what decides a soul, for 15 seconds of sun, until there is nothing left', async ({ page }) => {
  expect(first?.meta.proof.length).toBeGreaterThan(0);
  await page.clock.setFixedTime(DATE);
  await page.goto('./');
  await page.getByTestId('play-daily').click();
  await page.getByTestId('begin').click();

  const before = seconds(await page.getByTestId('sun').textContent());
  if (await drawer(page)) await page.getByTestId('hint').click();
  else await page.keyboard.press('h');
  await expect(page.locator('.toast')).toHaveText(/^Skögul (points at|holds out|hands you|taps|looks up|listens)/);
  const spent = before - seconds(await page.getByTestId('sun').textContent());
  expect(spent).toBeGreaterThanOrEqual(15);
  expect(spent).toBeLessThanOrEqual(17);
  // What she pointed at is highlighted until it's been looked at.
  await expect(page.locator('.shift')).toHaveAttribute('data-coach', /\S/);

  // A careful player's look at everything leaves her nothing to show.
  await lookAtEverything(page);
  await page.getByTestId('flip').click();
  await lookAtEverything(page);
  await page.getByTestId('feather').click();
  if (await drawer(page)) await page.locator('[data-tab="ravens"]').click();
  await expect(page.getByTestId('hint')).toBeDisabled();
  await expect(page.getByTestId('hint')).toHaveAttribute('title', /nothing more to show you/);
});
