import { expect, test } from '@playwright/test';
import { FULL } from './urls';

/*
 * The journal's threads in the full game: what's still in play, read from the
 * run's story flags. Reaching Day 17 by play takes minutes, so the test writes
 * the flags into the saved morning, as the save would hold them.
 */

test.use({ baseURL: FULL });

test('the journal lists what is still in play: the deal, the ferry, what you have learned', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('play-campaign').click();
  await page.getByTestId('new-0').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 1');
  await page.getByTestId('journal-open').click();
  await expect(page.getByTestId('journal-threads')).toHaveCount(0);
  await expect(page.getByTestId('journal')).toContainText('Nothing yet.');
  await page.getByTestId('journal-close').click();

  await page.evaluate((key) => {
    const record = JSON.parse(localStorage.getItem(key) ?? 'null');
    record.rev += 1;
    const morning = record.save.mornings[record.save.mornings.length - 1];
    morning.flags = { ...morning.flags, loki_deal: 1, ferryman: 1, truth: 2 };
    localStorage.setItem(key, JSON.stringify(record));
  }, 'cots.campaign.0');
  await page.reload();
  await page.getByTestId('play-campaign').click();
  await page.getByTestId('continue-0').click();
  await page.getByTestId('journal-open').click();
  await expect(page.getByTestId('journal-threads').locator('li')).toHaveText([
    "The man with the scarred lips has your family's names, and room for them on his ship.",
    'The ferryman at the mouth of the fjord is holding places for your family. He wants a hundred rings more on the day the horn blows.',
    "You've heard 2 things about what comes after the fire.",
  ]);
});
