import { type Destination, endlessRound } from '@cots/engine';
import { loadContent } from '@cots/testkit';
import { expect, type Page, test } from '@playwright/test';

/*
 * Endless on the web demo: rounds of five souls on each day's rules in turn,
 * until three wrong stamps. Its seed comes from the clock and Math.random, so
 * the test pins both and works out each round, and the right answers, with
 * the engine itself.
 */

const content = loadContent('web-demo');
const DATE = new Date('2027-03-01T12:00:00Z');
const SEED = `endless:${DATE.getTime().toString(36)}:${Math.floor(0.5 * 1e9).toString(36)}`;

const drawer = async (page: Page) => (await page.locator('.shift--drawer').count()) > 0;

async function stampAndSend(page: Page, dest: Destination) {
  if (await drawer(page)) await page.getByTestId('judge').click();
  await page.locator(`[data-dest="${dest}"]`).click();
  await page.getByTestId('send').click();
}

test('Endless: a clean round goes on to the next day’s rules; three strikes end it with a best', async ({ page }) => {
  await page.clock.setFixedTime(DATE);
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await page.goto('./');
  await page.getByTestId('endless-start').click();
  await expect(page.getByTestId('briefing-title')).toHaveText("Endless, round 1: Day 1's rules");
  await page.getByTestId('begin').click();
  for (const c of endlessRound(content, SEED, 0).cases) await stampAndSend(page, c.expect.dest);

  // Straight on to Day 2's rules, with the score so far.
  await expect(page.getByTestId('briefing-title')).toHaveText("Endless, round 2: Day 2's rules");
  await expect(page.getByTestId('endless-status')).toHaveText('5 souls judged rightly · strikes 0 of 3');
  await page.getByTestId('begin').click();
  const round = endlessRound(content, SEED, 1).cases;
  for (const [i, c] of round.slice(0, 3).entries()) {
    await stampAndSend(page, c.expect.dest === 'HEL' ? 'VALHALLA' : 'HEL');
    if (i < 2) {
      await expect(page.getByTestId('strikes')).toHaveText(`Strikes ${i + 1}/3`);
      await page.getByTestId('citation-close').click();
    }
  }

  // The third strike ends the run where it stands.
  await expect(page.getByTestId('endless-over')).toHaveText('Three strikes');
  await expect(page.getByTestId('endless-score')).toHaveText("5 souls judged rightly, as far as Day 2's rules.");
  await expect(page.getByTestId('endless-record')).toHaveText('A new best.');
  await page.getByTestId('home').click();
  await expect(page.getByTestId('endless-best')).toHaveText('Best: 5 souls');
  await page.reload();
  await expect(page.getByTestId('endless-best')).toHaveText('Best: 5 souls');
});
