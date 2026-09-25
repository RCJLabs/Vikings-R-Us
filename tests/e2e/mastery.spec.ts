import AxeBuilder from '@axe-core/playwright';
import type { Destination } from '@cots/engine';
import { loadContent } from '@cots/testkit';
import { expect, type Page, test } from '@playwright/test';
import { FULL } from './urls';

/*
 * Mastery (docs/tech-spec.md §49) in the full game: the oath, sworn for a new run (no hints, no warnings before
 * the fines, no replays), the day's mark at the audit, and each day's best kept on the device, which gives
 * replaying a day something to beat.
 */

test.use({ baseURL: FULL });

const DAYS = loadContent('dev-full').days.filter((d) => d.day >= 1).length;

const isDrawer = async (page: Page) => (await page.locator('.shift--drawer').count()) > 0;

async function stampAndSend(page: Page, dest: Destination) {
  if (await isDrawer(page)) await page.getByTestId('judge').click();
  await page.locator(`[data-dest="${dest}"]`).click();
  await page.getByTestId('send').click();
}

/** Today's queue as saved in slot 0: where each soul belongs. */
async function savedAnswers(page: Page): Promise<Destination[]> {
  const raw = await page.evaluate(() => localStorage.getItem('cots.campaign.0'));
  const record = JSON.parse(raw ?? 'null') as { save: { queue: { expect: { dest: Destination } }[] | null } } | null;
  return (record?.save.queue ?? []).map((c) => c.expect.dest);
}

async function playScene(page: Page) {
  await expect(page.getByTestId('scene')).toBeVisible();
  while ((await page.getByTestId('scene-done').count()) === 0) await page.getByTestId('scene-choice').first().click();
  await page.getByTestId('scene-done').click();
  await expect(page.getByTestId('scene')).toHaveCount(0);
}

/** Day 1's shift with its first soul sent the wrong way (cited on the spot) and the rest judged rightly. */
async function oneMistake(page: Page): Promise<number> {
  const [first, ...rest] = await savedAnswers(page);
  if (!first) throw new Error('no souls saved for the day');
  await stampAndSend(page, first === 'VALHALLA' ? 'HEL' : 'VALHALLA');
  await page.getByTestId('citation-close').click();
  for (const dest of rest) await stampAndSend(page, dest);
  await expect(page.getByTestId('audit-title')).toHaveText('Day 1: the audit');
  await expect(page.getByTestId('audit-score')).toHaveText(`${rest.length} of ${rest.length + 1} judged rightly`);
  return rest.length + 1;
}

async function expectAccessible(page: Page) {
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
}

test('the oath: no hints, fined from the first mistake, no replays; the day’s mark kept as the day’s best', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByTestId('play-campaign').click();
  // Not sworn in Story Mode.
  await page.getByTestId('oath-0').check();
  await expect(page.getByTestId('story-0')).toBeDisabled();
  await page.getByTestId('new-0').click();

  await expect(page.getByTestId('morning-title')).toHaveText('Day 1');
  await expect(page.locator('.screen--morning > p.muted').first()).toContainText('in your purse · Under oath');
  await playScene(page);
  // The assists can't waive its fines, and the morning says what it holds to.
  await page.getByTestId('morning-assists').locator('summary').click();
  await expect(page.getByTestId('oath-terms')).toHaveText(
    "You're under oath: Skögul gives no hints, no day can be replayed, and every mistake is fined, whatever the assists say.",
  );
  await expect(page.getByTestId('setting-no-fines')).toHaveCount(0);
  await page.getByTestId('to-gate').click();

  // Skögul gives no hints.
  await expect(page.getByTestId('soul-count')).toHaveText('Soul 1 of 6');
  await expect(page.getByTestId('hint')).toHaveCount(0);
  await oneMistake(page);

  // No warning first: the first mistake is fined.
  await expect(page.getByTestId('ledger')).toContainText('Fines for 1 mistake');
  await expect(page.getByTestId('ledger')).not.toContainText('forgiven');
  await expect(page.getByTestId('day-grade')).toHaveText("The day's mark: Steady");
  await expect(page.getByTestId('day-grade-why')).toHaveText(
    'One soul not judged rightly. Sharp judges them all rightly.',
  );
  await expect(page.getByTestId('day-best')).toHaveText('Your best yet for Day 1.');
  await expectAccessible(page);

  await page.getByTestId('go-home').click();
  await expect(page.getByTestId('night-title')).toHaveText('Night 1');
  await playScene(page);
  await page.getByTestId('sleep').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 2');
  await page.getByTestId('campaign-quit').click();

  // The slot is sworn, it offers no replay, and Day 1's best is kept, played under oath.
  await expect(page.getByTestId('slot-0').getByTestId('slot-summary')).toContainText('· Under oath');
  await expect(page.getByTestId('replay-day-0')).toHaveCount(0);
  await expect(page.getByTestId('best-day')).toHaveText([
    /^Day 1: Steady(, with \d+:\d\d of sun to spare)? \(under oath\)$/,
  ]);
  await expect(page.getByTestId('best-days-none')).toHaveText(`No grade yet: Days 2–${DAYS}`);
  await expectAccessible(page);
});

test('a day’s best on this device is the one to beat when the day is played again', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'cots.settings',
      JSON.stringify({ v: 1, dayBests: { '1': { grade: 'flawless', spareMs: 300_000, oath: true } } }),
    ),
  );
  await page.goto('./');
  await page.getByTestId('play-campaign').click();
  await expect(page.getByTestId('best-day')).toHaveText(['Day 1: Flawless, with 5:00 of sun to spare (under oath)']);
  await page.getByTestId('new-0').click();
  await playScene(page);
  await page.getByTestId('to-gate').click();

  // Without the oath, Skögul hints and the day's first mistake is a warning.
  await expect(page.getByTestId('hint')).toBeVisible();
  await oneMistake(page);
  await expect(page.getByTestId('ledger')).toContainText('1 mistake forgiven');
  await expect(page.getByTestId('day-grade')).toHaveText("The day's mark: Steady");
  await expect(page.getByTestId('day-best')).toHaveText(
    'Your best for Day 1: Flawless, with 5:00 of sun to spare (under oath)',
  );
  const bests = await page.evaluate(() => JSON.parse(localStorage.getItem('cots.settings') ?? '{}').dayBests);
  expect(bests).toEqual({ '1': { grade: 'flawless', spareMs: 300_000, oath: true } });
});
