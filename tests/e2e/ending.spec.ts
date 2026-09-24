import type { Destination } from '@cots/engine';
import { expect, type Page, test } from '@playwright/test';
import { FULL } from './urls';

/*
 * The Ragnarök report in the full game, on the quickest ending to reach:
 * the test empties the saved morning's purse after a night in debt, so the
 * next night in debt demotes the player on Day 1.
 */

test.use({ baseURL: FULL });

async function playScene(page: Page) {
  while ((await page.getByTestId('scene-done').count()) === 0) await page.getByTestId('scene-choice').first().click();
  await page.getByTestId('scene-done').click();
}

async function judgeAll(page: Page) {
  const raw = await page.evaluate(() => localStorage.getItem('cots.campaign.0'));
  const queue = (JSON.parse(raw ?? 'null')?.save.queue ?? []) as { expect: { dest: Destination } }[];
  for (const c of queue) {
    if ((await page.locator('.shift--drawer').count()) > 0) await page.getByTestId('judge').click();
    await page.locator(`[data-dest="${c.expect.dest}"]`).click();
    await page.getByTestId('send').click();
  }
}

test('the ending reports the host part by part, naming only the endings found', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('play-campaign').click();
  await page.getByTestId('new-0').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 1');
  await page.evaluate(() => {
    const record = JSON.parse(localStorage.getItem('cots.campaign.0') ?? 'null');
    record.rev += 1;
    const morning = record.save.mornings[record.save.mornings.length - 1];
    morning.rings = -200;
    morning.debtNights = 1;
    localStorage.setItem('cots.campaign.0', JSON.stringify(record));
  });
  await page.reload();
  await page.getByTestId('play-campaign').click();
  await page.getByTestId('continue-0').click();
  await playScene(page);
  await page.getByTestId('to-gate').click();
  await judgeAll(page);
  await page.getByTestId('go-home').click();
  await playScene(page);
  await page.getByTestId('sleep').click();

  await expect(page.getByTestId('ending-title')).toHaveText('Demoted');
  await expect(page.getByTestId('ending-found-count')).toHaveText('1 of 11 endings found on this device.');
  const total = Number(await page.getByTestId('host-total').textContent());
  expect(total).toBeGreaterThan(0);
  await expect(page.getByTestId('host-marks').locator('li')).toHaveText([
    "An ending you haven't found: a host of 260 or more.",
    "An ending you haven't found: a host of 240 or less.",
  ]);
});
