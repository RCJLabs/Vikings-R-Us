import type { Destination } from '@cots/engine';
import { expect, type Page, test } from '@playwright/test';

/*
 * Planning the night (audit item 5), in the web demo: how soon the sick need
 * medicine and what each bill left unpaid does, tonight's bills in the morning
 * and beside an option that costs rings, and the nights ahead.
 */

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

async function newCampaign(page: Page) {
  await page.goto('./');
  await page.getByTestId('play-campaign').click();
  await page.getByTestId('new-0').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 1');
}

test('the night says what each bill left unpaid does, and what the coming nights cost', async ({ page }) => {
  await newCampaign(page);
  // The mother on her second night sick, the brother after a cold night, the sister newly sick.
  await page.evaluate(() => {
    const record = JSON.parse(localStorage.getItem('cots.campaign.0') ?? 'null');
    record.rev += 1;
    record.save.mornings[record.save.mornings.length - 1].family = [
      { id: 'mother', status: 'sick', cold: 0, hungry: 0, sickNights: 1 },
      { id: 'brother', status: 'well', cold: 1, hungry: 0, sickNights: 0 },
      { id: 'sister', status: 'sick', cold: 0, hungry: 0, sickNights: 0 },
    ];
    localStorage.setItem('cots.campaign.0', JSON.stringify(record));
  });
  await page.reload();
  await page.getByTestId('play-campaign').click();
  await page.getByTestId('continue-0').click();
  await playScene(page);
  // Firewood 6, food 3 for each of three, medicine 10 for each of the two sick.
  await expect(page.getByTestId('tonight-bills')).toHaveText("Tonight's bills, if you pay them all: 35 rings.");
  await page.getByTestId('to-gate').click();
  await judgeAll(page);
  await page.getByTestId('go-home').click();
  await playScene(page);

  const family = page.getByTestId('family');
  await expect(family.locator('[data-member="mother"]')).toContainText('sick, needs medicine tonight');
  await expect(family.locator('[data-member="sister"]')).toContainText('sick, needs medicine within 2 nights');
  await page.getByTestId('bill-hearth').uncheck();
  await page.getByTestId('bill-medicine-mother').uncheck();
  await page.getByTestId('bill-medicine-sister').uncheck();
  await expect(page.getByTestId('outlook-lost')).toHaveText('Without medicine tonight, Ragna dies.');
  await expect(page.getByTestId('outlook-sickens')).toHaveText('Without firewood tonight, Ulf falls sick.');
  await expect(page.getByTestId('outlook-worse')).toHaveText(
    'Without medicine tonight, Asa stays sick: one more night without it and Asa is sent to live with relatives.',
  );
  // Nobody well is left to chance: the brother's second cold night makes him sick for certain.
  await expect(page.getByTestId('outlook-risk')).toHaveCount(0);
  // The demo's last two nights: firewood and food for three, and medicine a head.
  await expect(page.getByTestId('night-ahead')).toHaveText([/^Night 2\s*15\s*10$/, /^Night 3\s*15\s*10$/]);
  await page.getByTestId('bill-hearth').check();
  await expect(page.getByTestId('outlook-sickens')).toHaveCount(0);
  await page.getByTestId('bill-hearth').uncheck();
  await page.getByTestId('sleep').click();

  await expect(page.getByTestId('morning-title')).toHaveText('Day 2');
  await expect(page.getByTestId('night-news')).toContainText('Ragna died in the night.');
  await expect(page.getByTestId('night-news')).toContainText('Ulf fell sick in the night.');
});

test('an option that costs rings is weighed against tonight’s bills', async ({ page }) => {
  await newCampaign(page);
  await playScene(page);
  await page.getByTestId('to-gate').click();
  await judgeAll(page);
  await page.getByTestId('go-home').click();
  await playScene(page);
  await page.getByTestId('sleep').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 2');
  await playScene(page);
  await page.getByTestId('to-gate').click();
  await judgeAll(page);
  await page.getByTestId('go-home').click();

  // Ulf's letter asks for five rings; tonight's bills are firewood 6 and food for three, 9.
  const purse = page.getByTestId('scene-purse');
  await expect(purse).toHaveText(/^You have \d+ rings\. Tonight's bills come to 15 if you pay them all\.$/);
  const rings = Number(/You have (\d+)/.exec((await purse.textContent()) ?? '')?.[1]);
  await expect(page.getByTestId('scene-leaves')).toHaveText(`(leaves ${rings - 5 - 15} after tonight's bills)`);
});
