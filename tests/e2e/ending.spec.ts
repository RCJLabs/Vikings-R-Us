import type { Destination } from '@cots/engine';
import { expect, type Page, test } from '@playwright/test';
import { FULL } from './urls';

/*
 * The ending's report in the full game, on the quickest ending to reach:
 * the test empties the saved morning's purse after a night in debt, so the
 * next night in debt demotes the player on Day 1. On the way, the screens say
 * so: a banner from the morning, a warning at the bills, and a sleep that asks first.
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

test('the ending reports what the endings ask of the last battle, naming only the endings found', async ({ page }) => {
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
  await expect(page.getByTestId('debt-banner')).toHaveText(
    "Last night ended below -30 rings. End tonight below it too and you're demoted.",
  );
  await playScene(page);
  await page.getByTestId('to-gate').click();
  await judgeAll(page);
  await page.getByTestId('go-home').click();
  await playScene(page);
  await expect(page.getByTestId('debt-banner')).toBeVisible();
  await expect(page.getByTestId('debt-warning')).toHaveText(
    "Tonight ends below -30 rings: sleep like this and you're demoted, and the run ends.",
  );
  await page.getByTestId('sleep').click();
  await expect(page.getByTestId('sleep-confirm')).toContainText('Sleeping now gets you demoted, and the run ends.');
  await page.getByTestId('sleep-cancel').click();
  await expect(page.getByTestId('night-title')).toHaveText('Night 1');
  await page.getByTestId('sleep').click();
  await page.getByTestId('sleep-anyway').click();

  await expect(page.getByTestId('ending-title')).toHaveText('Demoted');
  await expect(page.getByTestId('ending-found-count')).toHaveText('1 of 11 endings found on this device.');
  // Demoted on Day 1, there was no battle (docs/tech-spec.md §54); what the endings ask of it is still said.
  await expect(page.getByTestId('battle-unfought')).toHaveText("It wasn't fought: the run ended first.");
  await expect(page.getByTestId('battle-marks').locator('li')).toHaveText([
    "An ending you haven't found: the fire held and at least 3 fronts held.",
    "An ending you haven't found: Hel's gate held.",
    "An ending you haven't found: the fire held.",
    "An ending you haven't found: the wolf held.",
    "An ending you haven't found: no more than 1 front held.",
  ]);
  await expect(page.getByTestId('host')).toHaveCount(0);
});
