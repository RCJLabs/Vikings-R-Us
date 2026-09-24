import type { Destination } from '@cots/engine';
import { expect, type Page, test } from '@playwright/test';

/*
 * Where the page is as the player moves through the game (docs/tech-spec.md §30): every screen, and
 * each part of one (a scene, what follows it), opens at its top, however far down the last one was
 * scrolled; a choice in a scene brings the lines it adds to the top of the view; focus given for the
 * keyboard never pulls the page down; and a reload opens at the top.
 */

// (The page's own code, as text: these tests are typed without the browser's DOM.)
const scrollY = (page: Page) => page.evaluate<number>('Math.round(window.scrollY)');
const toBottom = (page: Page) => page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
const atEnd = (page: Page) =>
  page.evaluate<boolean>('Math.abs(window.scrollY + window.innerHeight - document.documentElement.scrollHeight) <= 1');
const atTop = async (page: Page) => expect.poll(() => scrollY(page)).toBe(0);

const drawer = async (page: Page) => (await page.locator('.shift--drawer').count()) > 0;

async function stampAndSend(page: Page, dest: Destination) {
  if (await drawer(page)) await page.getByTestId('judge').click();
  await page.locator(`[data-dest="${dest}"]`).click();
  await page.getByTestId('send').click();
}

/** Today's queue as saved in a slot: where each soul belongs. */
async function savedAnswers(page: Page, slot: number): Promise<Destination[]> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), `cots.campaign.${slot}`);
  const record = JSON.parse(raw ?? 'null') as { save: { queue: { expect: { dest: Destination } }[] | null } } | null;
  return (record?.save.queue ?? []).map((c) => c.expect.dest);
}

/**
 * Plays the scene on screen to its end, first options each time. After every choice the first line it
 * added is at the top of the view (a little room above it), or as near as the page's end allows, and
 * the next option has the keyboard's focus.
 */
async function playScene(page: Page) {
  await expect(page.getByTestId('scene')).toBeVisible();
  while ((await page.getByTestId('scene-done').count()) === 0) {
    const shown = await page.locator('.scene__line').count();
    await page.getByTestId('scene-choice').first().click();
    const line = page.locator(`.scene__line[data-line="${shown}"]`);
    await expect(line).toHaveClass(/scene__line--chosen/);
    const top = await line.evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(0);
    if (!(await atEnd(page))) expect(top).toBeLessThanOrEqual(16);
    await expect(page.locator('[data-testid="scene-choice"], [data-testid="scene-done"]').first()).toBeFocused();
  }
  // Scrolled to the end to press Continue, as a player would: what follows still opens at the top.
  await toBottom(page);
  await page.getByTestId('scene-done').click();
  await expect(page.getByTestId('scene')).toHaveCount(0);
}

test('each campaign screen and scene opens at the top, however far the last was scrolled', async ({ page }) => {
  await page.goto('./');
  await toBottom(page);
  await page.getByTestId('play-campaign').click();
  await atTop(page);
  await page.getByTestId('new-0').click();

  // Day 1's morning: the scene's first option has the keyboard's focus, but the page stays at the top.
  await expect(page.getByTestId('morning-title')).toHaveText('Day 1');
  await expect(page.getByTestId('scene-choice').first()).toBeFocused();
  await atTop(page);
  await playScene(page);
  await expect(page.getByTestId('to-gate')).toBeVisible();
  await atTop(page);

  await page.getByTestId('to-gate').click();
  for (const dest of await savedAnswers(page, 0)) await stampAndSend(page, dest);
  await expect(page.getByTestId('audit-title')).toHaveText('Day 1: the audit');
  await atTop(page);
  await toBottom(page);
  await page.getByTestId('go-home').click();

  await expect(page.getByTestId('night-title')).toHaveText('Night 1');
  await atTop(page);
  await playScene(page);
  await expect(page.getByTestId('sleep')).toBeVisible();
  await atTop(page);
  await toBottom(page);
  await page.getByTestId('sleep').click();

  await expect(page.getByTestId('morning-title')).toHaveText('Day 2');
  await atTop(page);
});

test('the way into a shift and back opens each screen at the top', async ({ page }) => {
  await page.goto('./');
  await toBottom(page);
  expect(await scrollY(page)).toBeGreaterThan(0);
  await page.getByTestId('practice-3').click();
  await expect(page.getByTestId('briefing-title')).toHaveText('Day 3 practice');
  await expect(page.getByTestId('begin')).toBeFocused();
  await atTop(page);
  await page.getByTestId('begin').click();
  await expect(page.getByTestId('soul-count')).toHaveText(/^Soul 1 of \d+$/);
  await atTop(page);
  await page.getByTestId('pause').click();
  await page.getByTestId('leave-shift').click();
  await expect(page.getByTestId('practice-3')).toBeVisible();
  await atTop(page);
});

test('a reload opens at the top, not where the page was scrolled', async ({ page }) => {
  await page.goto('./');
  await toBottom(page);
  expect(await scrollY(page)).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByTestId('play-daily')).toBeVisible();
  await atTop(page);
});

test('on the phone, each tab of the evidence panel opens at its top', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the tabbed panel is the phone layout');
  await page.goto('./');
  await page.getByTestId('practice-3').click();
  await page.getByTestId('begin').click();
  const panel = page.locator('.drawer__panel');
  await page.locator('[data-tab="rules"]').click();
  // The rulebook is longer than the panel: read down it, then look at the soul's words.
  await panel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.locator('[data-tab="words"]').click();
  expect(await panel.evaluate((el) => el.scrollTop)).toBe(0);
  await page.locator('[data-tab="rules"]').click();
  expect(await panel.evaluate((el) => el.scrollTop)).toBe(0);
});
