import { startShift } from '@cots/engine';
import { loadDailyContent } from '@cots/testkit';
import { expect, type Page, test } from '@playwright/test';

/*
 * The primer, played by following the coach: every step must be reachable in
 * both layouts, highlight something, and end the way its text says.
 */

const content = loadDailyContent();
const { state } = startShift(content, { mode: 'primer', seed: 'primer', day: 5, untimed: true });
const lie = state.cases[1]?.lies[0]?.field ?? '';

const drawer = async (page: Page) => (await page.locator('.shift--drawer').count()) > 0;
const step = (page: Page, id: string) => expect(page.getByTestId('coach')).toHaveAttribute('data-step', id);

async function look(page: Page, region: string) {
  await page.locator(`.chip--look[data-region="${region}"]`).click();
}

async function stamp(page: Page, dest: string) {
  if (await drawer(page)) await page.getByTestId('judge').click();
  await page.locator(`[data-dest="${dest}"]`).click();
  await page.getByTestId('send').click();
}

async function noMissingText(page: Page) {
  expect(await page.locator('body').innerText()).not.toContain('⟦');
}

test('a newcomer takes the primer by following the coach, then goes to the Daily', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('play-primer').click();
  await expect(page.getByTestId('briefing-title')).toHaveText('Primer');
  await page.getByTestId('begin').click();

  // Soul 1: look, read the rules, stamp Valhalla.
  await step(page, 'c1.look');
  await expect(page.locator('.shift')).toHaveAttribute('data-coach', 'hands');
  await noMissingText(page);
  await look(page, 'handR');
  await step(page, 'c1.chest');
  await look(page, 'chest');
  await step(page, 'c1.rules');
  if (await drawer(page)) await page.locator('[data-tab="rules"]').click();
  await page.getByTestId('coach-next').click();
  await step(page, 'c1.stamp');
  await stamp(page, 'VALHALLA');

  // Soul 2: read, turn over, look at the back, catch the lie, stamp Hel.
  await step(page, 'c2.words');
  if (await drawer(page)) await page.locator('[data-tab="words"]').click();
  await page.getByTestId('coach-next').click();
  await step(page, 'c2.flip');
  await page.getByTestId('flip').click();
  await step(page, 'c2.back');
  await look(page, 'back');
  await step(page, 'c2.compare');
  await page.locator(`[data-field="${lie}"]`).click();
  await page.locator('[data-field="body.back.woundsBack"]').click();
  await expect(page.locator(`.evidence.is-lie:has([data-field="${lie}"])`)).toBeVisible();
  await step(page, 'c2.judge');
  await noMissingText(page);
  await stamp(page, 'HEL');

  // Soul 3: the mist at the lips, the feather, Return.
  await step(page, 'c3.face');
  await look(page, 'face');
  await step(page, 'c3.feather');
  await page.getByTestId('feather').click();
  await step(page, 'c3.stamp');
  await stamp(page, 'RETURN');

  await expect(page.getByTestId('score')).toHaveText('3 of 3 judged rightly');
  await expect(page.getByTestId('primer-done')).toContainText("You're ready");
  await noMissingText(page);
  await page.getByTestId('primer-to-daily').click();
  await expect(page.getByTestId('briefing-title')).toHaveText(/^Daily (Shift #\d+|preview)$/);

  // Done once: the title stops suggesting it, but it can be replayed from Practice.
  await page.goto('./');
  await expect(page.getByTestId('play-primer')).toHaveCount(0);
  await expect(page.getByTestId('replay-primer')).toBeVisible();
});

test('the primer can be skipped', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('play-primer').click();
  await page.getByTestId('begin').click();
  await page.getByTestId('coach-skip').click();
  await expect(page.getByTestId('play-daily')).toBeVisible();
  await expect(page.getByTestId('play-primer')).toHaveCount(0);
});
