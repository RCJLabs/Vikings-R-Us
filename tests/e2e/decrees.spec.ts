import { type CaseSpec, type Destination, startShift } from '@cots/engine';
import { loadContent } from '@cots/testkit';
import { expect, type Page, test } from '@playwright/test';
import { FULL } from './urls';

/*
 * The later decrees in the full game, played in Practice: clipping nails
 * (Day 8), the clerk's TRANSFER (Day 10), forged saga tallies (Day 11) and
 * Loki's DETAIN (Day 12). Practice seeds come from the clock and
 * Math.random, so the test pins both and works out the queue, and the right
 * answers, with the engine itself.
 */

test.use({ baseURL: FULL });

const content = loadContent('dev-full');
const DATE = new Date('2027-03-01T12:00:00Z');
const SEED = `practice:${DATE.getTime().toString(36)}:${Math.floor(0.5 * 1e9).toString(36)}`;

const queueFor = (day: number): CaseSpec[] => [
  ...startShift(content, { mode: 'practice', seed: SEED, day }).state.cases,
];

async function openPractice(page: Page, day: number) {
  await page.clock.setFixedTime(DATE);
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await page.goto('./');
  await page.getByTestId(`practice-${day}`).click();
  await expect(page.getByTestId('briefing-title')).toHaveText(`Day ${day} practice`);
  await page.getByTestId('begin').click();
}

const drawer = async (page: Page) => (await page.locator('.shift--drawer').count()) > 0;

async function stampAndSend(page: Page, dest: Destination) {
  if (await drawer(page)) await page.getByTestId('judge').click();
  await page.locator(`[data-dest="${dest}"]`).click();
  await page.getByTestId('send').click();
}

const needsClipping = (c: CaseSpec) => c.expect.procedures?.includes('proc.clip') === true;

test('the key hint counts the full game’s seven stamps and its registry key', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.title__keys')).toContainText('T feather · G registry · C compare');
  await expect(page.locator('.title__keys')).toContainText('1-7 stamps');
});

test('Day 8: a right stamp on unclipped nails earns a citation; clipping first is right', async ({ page }) => {
  const queue = queueFor(8);
  const firstLong = queue.findIndex(needsClipping);
  expect(firstLong).toBeGreaterThanOrEqual(0);
  await openPractice(page, 8);

  for (const [i, c] of queue.entries()) {
    await expect(page.getByTestId('soul-count')).toHaveText(`Soul ${i + 1} of ${queue.length}`);
    if (needsClipping(c) && i !== firstLong) await page.getByTestId('clippers').click();
    await stampAndSend(page, c.expect.dest);
    if (i === firstLong) {
      await expect(page.getByTestId('citation-skipped')).toContainText('clip the nails');
      await page.getByTestId('citation-close').click();
    }
  }
  await expect(page.getByTestId('score')).toHaveText(`${queue.length - 1} of ${queue.length} judged rightly`);
  await expect(page.getByTestId('verdict').nth(firstLong)).toContainText('not done: clip the nails');
});

test('Day 11: a forged tally shows its sign under the rune-lens', async ({ page }) => {
  const queue = queueFor(11);
  const forged = queue.findIndex((c) => c.lies.some((l) => l.via === 'tally'));
  expect(forged).toBeGreaterThanOrEqual(0);
  await openPractice(page, 11);

  for (const [i, c] of queue.entries()) {
    await expect(page.getByTestId('soul-count')).toHaveText(`Soul ${i + 1} of ${queue.length}`);
    if (i === forged) {
      const lie = c.lies.find((l) => l.via === 'tally');
      if (await drawer(page)) await page.locator('[data-tab="tally"]').click();
      const tally = page.getByTestId('tally');
      await expect(tally.locator(`[data-field="${lie?.field}"]`)).toBeVisible();
      await expect(tally).toContainText('rune-lens');
      await page.getByTestId('runeLens').click();
      if (await drawer(page)) await page.locator('[data-tab="tally"]').click();
      await expect(tally.locator('[data-field="tally.tell"]')).toContainText('Under the lens');
    }
    if (needsClipping(c)) await page.getByTestId('clippers').click();
    await stampAndSend(page, c.expect.dest);
  }
  await expect(page.getByTestId('score')).toHaveText(`${queue.length} of ${queue.length} judged rightly`);
});

test('Day 11: the rune a forgery sign quotes is drawn in the game’s own runic font', async ({ page }) => {
  const queue = queueFor(11);
  const elder = queue.findIndex((c) => c.evidence.fields.some((f) => f.tell === 'elderRune'));
  expect(elder).toBeGreaterThanOrEqual(0);
  await openPractice(page, 11);
  for (const c of queue.slice(0, elder)) {
    if (needsClipping(c)) await page.getByTestId('clippers').click();
    await stampAndSend(page, c.expect.dest);
  }
  await expect(page.getByTestId('soul-count')).toHaveText(`Soul ${elder + 1} of ${queue.length}`);
  await page.getByTestId('runeLens').click();
  if (await drawer(page)) await page.locator('[data-tab="tally"]').click();
  await expect(page.locator('[data-field="tally.tell"]')).toContainText('one rune, ᛗ,');

  // Chromium's record of the fonts that drew the line: the rune came from the bundled font, not
  // from whatever this machine has (a system without one shows a blank box).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const drawnWith = async () => {
    const { root } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: '[data-field="tally.tell"]',
    });
    return (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts;
  };
  await expect
    .poll(drawnWith)
    .toContainEqual(expect.objectContaining({ familyName: 'Noto Sans Runic', isCustomFont: true, glyphCount: 1 }));
});

test('Day 10: the baptized are stamped TRANSFER, and the cross is on the neck', async ({ page }) => {
  const queue = queueFor(10);
  const baptized = queue.findIndex((c) => c.expect.dest === 'TRANSFER');
  expect(baptized).toBeGreaterThanOrEqual(0);
  await openPractice(page, 10);
  for (const [i, c] of queue.entries()) {
    await expect(page.getByTestId('soul-count')).toHaveText(`Soul ${i + 1} of ${queue.length}`);
    if (i === baptized) {
      await page.locator('.stage .hotspot[data-region="neck"]').click();
      await expect(page.locator('.clues')).toContainText('A cross on a cord');
    }
    if (needsClipping(c)) await page.getByTestId('clippers').click();
    await stampAndSend(page, c.expect.dest);
  }
  await expect(page.getByTestId('score')).toHaveText(`${queue.length} of ${queue.length} judged rightly`);
});

test('Day 12: Loki is stamped DETAIN; his lips give him away', async ({ page }) => {
  const queue = queueFor(12);
  const loki = queue.findIndex((c) => c.expect.dest === 'DETAIN');
  expect(loki).toBeGreaterThanOrEqual(0);
  await openPractice(page, 12);
  for (const [i, c] of queue.entries()) {
    await expect(page.getByTestId('soul-count')).toHaveText(`Soul ${i + 1} of ${queue.length}`);
    if (i === loki) {
      await page.locator('.stage .hotspot[data-region="face"]').click();
      await expect(page.locator('.clues')).toContainText('Small stitch scars across the lips');
    }
    if (needsClipping(c)) await page.getByTestId('clippers').click();
    await stampAndSend(page, c.expect.dest);
  }
  await expect(page.getByTestId('score')).toHaveText(`${queue.length} of ${queue.length} judged rightly`);
});
