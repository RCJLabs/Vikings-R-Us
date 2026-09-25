import type { Destination } from '@cots/engine';
import { expect, type Page, test } from '@playwright/test';

/*
 * Appeals (docs/tech-spec.md §40) in the web demo. A campaign's seed comes from the clock and Math.random, so
 * pinning both pins the run: this one's first soul, stamped Hel when it belonged in Valhalla, asks to be
 * judged again the next morning.
 */

const DATE = new Date('2027-01-10T12:00:00Z');

const drawer = (page: Page) =>
  page
    .locator('.shift--drawer')
    .count()
    .then((n) => n > 0);

async function stampAndSend(page: Page, dest: Destination) {
  if (await drawer(page)) await page.getByTestId('judge').click();
  await page.locator(`[data-dest="${dest}"]`).click();
  await page.getByTestId('send').click();
}

async function playScene(page: Page) {
  await expect(page.getByTestId('scene')).toBeVisible();
  while ((await page.getByTestId('scene-done').count()) === 0) await page.getByTestId('scene-choice').first().click();
  await page.getByTestId('scene-done').click();
  await expect(page.getByTestId('scene')).toHaveCount(0);
}

/** Today's queue as saved: where each soul belongs. */
async function answers(page: Page): Promise<Destination[]> {
  const raw = await page.evaluate(() => localStorage.getItem('cots.campaign.0'));
  const record = JSON.parse(raw ?? 'null') as { save: { queue: { expect: { dest: Destination } }[] | null } } | null;
  return (record?.save.queue ?? []).map((c) => c.expect.dest);
}

/** Day 1 with its first soul stamped wrong, the night, and Day 2's morning scene: the appeal is next. */
async function toTheAppeal(page: Page): Promise<Destination> {
  await page.clock.setFixedTime(DATE);
  await page.addInitScript('Math.random = () => 0.01;');
  await page.goto('./');
  await page.getByTestId('play-campaign').click();
  await page.getByTestId('new-0').click();
  await playScene(page);
  await page.getByTestId('to-gate').click();
  const [first, ...rest] = await answers(page);
  expect(first).toBe('VALHALLA');
  await stampAndSend(page, 'HEL');
  await page.getByTestId('citation-close').click();
  for (const dest of rest) await stampAndSend(page, dest);
  await page.getByTestId('go-home').click();
  await playScene(page);
  await page.getByTestId('sleep').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 2');
  await playScene(page);
  await expect(page.getByTestId('appeal')).toContainText('Grim Hrafnsson, whom you sent to Hel on Day 1');
  return 'VALHALLA';
}

async function judgeTheDay(page: Page) {
  await page.getByTestId('to-gate').click();
  for (const dest of await answers(page)) await stampAndSend(page, dest);
  await expect(page.getByTestId('audit-title')).toHaveText('Day 2: the audit');
}

test('a mistake comes back the next morning, is heard at the desk on its own day, and is righted', async ({ page }) => {
  const right = await toTheAppeal(page);
  await page.getByTestId('appeal-hear').click();
  // The soul alone, with no sun, on Day 1's rules: the desk says what it was stamped.
  await expect(page.getByTestId('appeal-banner')).toHaveText('Appeal: Day 1, sent to Hel');
  await expect(page.getByTestId('soul-count')).toHaveText('Soul 1 of 1');
  await expect(page.getByTestId('sun')).toHaveText('No sun');
  // Leaving from the pause keeps the appeal for later.
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('leave-note')).toHaveText("The appeal waits for you on the morning's page.");
  await page.getByTestId('leave-shift').click();
  await expect(page.getByTestId('appeal')).toBeVisible();

  await page.getByTestId('appeal-hear').click();
  await stampAndSend(page, right);
  await expect(page.getByTestId('appeal-result')).toHaveText(
    'Righted: Grim goes to Valhalla after all. The citation is struck from the record.',
  );
  await expect(page.getByTestId('appeal')).toHaveCount(0);
  // Day 1's mistake cost Odin; the appeal gives it back, in a column of its own.
  await judgeTheDay(page);
  const odin = page.getByTestId('standing').locator('tr', { hasText: 'Odin' }).locator('td');
  await expect(odin.nth(2)).toHaveText('+1');
});

test('an appeal decided wrongly costs rings, and the audit says so', async ({ page }) => {
  await toTheAppeal(page);
  await page.getByTestId('appeal-hear').click();
  await stampAndSend(page, 'HEL');
  await expect(page.getByTestId('appeal-result')).toContainText(
    'Decided wrongly: Grim belonged in Valhalla. You pay 5 rings.',
  );
  await expect(page.getByTestId('appeal-result')).toContainText('The rule: The worthy go to Valhalla');
  await judgeTheDay(page);
  await expect(page.getByTestId('audit-appeal')).toHaveText(/This morning's appeal \(Grim, from Day 1\)\s*-5/);
});

test('a verdict can be left to stand, for nothing', async ({ page }) => {
  await toTheAppeal(page);
  const purse = await page.locator('.screen--morning > p.muted').first().textContent();
  await page.getByTestId('appeal-stand').click();
  await expect(page.getByTestId('appeal-result')).toHaveText("Grim's verdict stands.");
  await expect(page.locator('.screen--morning > p.muted').first()).toHaveText(purse ?? '');
});
