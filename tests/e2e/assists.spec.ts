import { type Destination, dailySeed, ruledOut, startShift, stepShift } from '@cots/engine';
import { loadDailyContent } from '@cots/testkit';
import { expect, type Page, test } from '@playwright/test';

/*
 * Assists (audit item 6), in the web demo: a slower sun and the rule tracker
 * in the Daily, which then says so when shared; and no fines in the campaign,
 * which the audit keeps. The test works out with the engine what the tracker
 * must grey out once the body has been looked over.
 */

// Daily #41 (DAILY_EPOCH is 2026-12-01), in the browser's own timezone.
const DATE = new Date('2027-01-10T12:00:00Z');
const N = 41;
test.use({ timezoneId: 'UTC' });

const content = loadDailyContent();
const spec = content.daily;
if (!spec) throw new Error('No Daily in content');
const { state, ctx } = startShift(content, { mode: 'daily', seed: dailySeed(N), day: spec.day, dailyNumber: N });
const begun = stepShift(state, { t: 'begin', at: 0 }, ctx).state;
/** What each soul's body alone rules out, once all of it has been looked at: front, back and feather. */
const bodyOut = state.cases.map((c, i) => {
  const seen = c.evidence.fields.filter((f) => f.id.startsWith('body.')).map((f) => f.id);
  return ruledOut({ ...begun, cursor: i, soul: { ...begun.soul, seen } }, ctx);
});
const tracked = bodyOut.findIndex((out) => out.length > 0);

const drawer = async (page: Page) => (await page.locator('.shift--drawer').count()) > 0;

async function lookAtEverything(page: Page) {
  const look = page.locator('.chip--look');
  while ((await look.count()) > 0) await look.first().click();
}

async function stampAndSend(page: Page, dest: Destination) {
  if (await drawer(page)) await page.getByTestId('judge').click();
  await page.locator(`[data-dest="${dest}"]`).click();
  await page.getByTestId('send').click();
}

async function playScene(page: Page) {
  while ((await page.getByTestId('scene-done').count()) === 0) await page.getByTestId('scene-choice').first().click();
  await page.getByTestId('scene-done').click();
}

test('a slower sun and the rule tracker in the Daily, which says so when shared', async ({ page }) => {
  expect(tracked).toBeGreaterThanOrEqual(0);
  await page.clock.setFixedTime(DATE);
  await page.goto('./');
  await page.locator('.card--settings summary').click();
  await page.getByTestId('setting-sun').selectOption('50');
  await page.getByTestId('setting-tracker').check();
  await page.getByTestId('play-daily').click();
  // Six minutes of sun at half speed.
  await expect(page.locator('.briefing__queue')).toHaveText('8 souls · 12:00 of sun');
  await expect(page.getByTestId('briefing-assists')).toHaveText('Assists on: sun ×0.5 and the rule tracker.');
  await page.getByTestId('begin').click();

  for (const [i, c] of state.cases.entries()) {
    await expect(page.getByTestId('soul-count')).toHaveText(`Soul ${i + 1} of ${state.cases.length}`);
    if (i === tracked) {
      await lookAtEverything(page);
      await page.getByTestId('flip').click();
      await lookAtEverything(page);
      await page.getByTestId('feather').click();
      if (await drawer(page)) await page.locator('[data-tab="rules"]').click();
      await expect(page.getByTestId('rule-tracker')).toBeVisible();
      for (const id of bodyOut[i] ?? []) {
        await expect(page.locator(`[data-rule="${id}"]`)).toHaveAttribute('data-out', 'true');
      }
      await expect(page.locator(`[data-rule="${c.expect.rule}"]`)).not.toHaveAttribute('data-out', 'true');
    }
    await stampAndSend(page, c.expect.dest);
  }

  await expect(page.getByTestId('score')).toHaveText('8 of 8 judged rightly');
  const share = await page.getByTestId('share-text').inputValue();
  expect(share).toMatch(/\n(🟩){8} 8\/8 · \d+:\d\d to spare · sun ×0\.5, rule tracker\n/);
  await page.getByTestId('home').click();
  await expect(page.getByTestId('daily-assisted')).toHaveText('Played with sun ×0.5 and the rule tracker.');
});

test('no fines in the campaign: the audit forgives every mistake and says which assists were on', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('play-campaign').click();
  await page.getByTestId('new-0').click();
  await playScene(page);
  await page.getByTestId('morning-assists').locator('summary').click();
  await page.getByTestId('setting-sun').selectOption('200');
  await page.getByTestId('setting-no-fines').check();
  await expect(page.getByTestId('morning-assists').locator('summary')).toHaveText('Assists: sun ×2 and no fines');
  // Six minutes of sun on Day 1, at twice the speed.
  await expect(page.locator('.briefing__queue')).toHaveText('The sun sets in 3:00.');
  await page.getByTestId('to-gate').click();

  const raw = await page.evaluate(() => localStorage.getItem('cots.campaign.0'));
  const queue = (JSON.parse(raw ?? 'null')?.save.queue ?? []) as { expect: { dest: Destination } }[];
  for (const [i, c] of queue.entries()) {
    await stampAndSend(page, c.expect.dest === 'HEL' ? 'VALHALLA' : 'HEL');
    // The last one goes straight to the audit.
    if (i < queue.length - 1) await page.getByTestId('citation-close').click();
  }

  await expect(page.getByTestId('audit-assists')).toHaveText('Assists on: sun ×2 and no fines.');
  await expect(page.getByTestId('ledger')).toContainText(`${queue.length} mistakes forgiven`);
  // Ten rings to start, nothing earned and nothing fined.
  await expect(page.getByTestId('audit-rings')).toHaveText('10');
});
