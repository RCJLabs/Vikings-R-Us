import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

/*
 * Save safety (audit item 10), in the web demo: a backup carries campaigns,
 * Daily results and records to another browser; a save this build can't read
 * is kept and shown, never taken for an empty slot; and the game asks the
 * browser to keep its saves once there's a campaign worth keeping.
 */

test.use({ timezoneId: 'UTC' });

// Daily #91 (DAILY_EPOCH is 2026-12-01).
const DATE = new Date('2027-03-01T12:00:00Z');
const result = (n: number) => ({
  n,
  g: 1,
  correct: 7,
  total: 8,
  spareMs: 30_000,
  endedBy: 'queue',
  marks: '🟩🟩🟩🟩🟩🟩🟩🟥',
  guard: 'ok',
});

/** Puts things in the synchronous copy of the saves, as the game would have left them, and reloads. */
async function seed(page: Page, entries: Record<string, unknown>) {
  await page.goto('./');
  await page.evaluate((e) => {
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, entries);
  await page.reload();
}

async function openSettings(page: Page) {
  await page.locator('.card--settings summary').click();
}

async function newCampaign(page: Page) {
  await page.getByTestId('play-campaign').click();
  await page.getByTestId('new-0').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 1');
  await page.getByTestId('campaign-quit').click();
  await page.getByTestId('campaign-back').click();
}

test('a backup carries campaigns, Daily results and records to another browser', async ({ page, browser }) => {
  await page.clock.setFixedTime(DATE);
  await seed(page, {
    'cots.daily': { v: 1, results: { '90': result(90), '91': result(91) } },
    'cots.settings': { v: 1, endlessBest: 12, textScale: 1.25 },
  });
  await newCampaign(page);
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('cots.campaign.0') ?? 'null').save);

  await openSettings(page);
  await page.getByTestId('backup-make').click();
  const text = await page.getByTestId('backup-text').inputValue();
  expect(JSON.parse(text)).toMatchObject({
    format: 'cots.backup',
    v: 1,
    daily: { v: 1, results: { '90': result(90), '91': result(91) } },
    slots: [{ v: 1, save: run }, null, null],
  });
  // The file holds the same text.
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-download').click()]);
  expect(file.suggestedFilename()).toBe('chooser-of-the-slain-backup-2027-03-01.json');
  const path = await file.path();
  expect(readFileSync(path, 'utf8')).toBe(text);

  // Another browser, with nothing saved: restore from the file.
  const { baseURL, viewport } = test.info().project.use;
  const other = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    viewport: viewport ?? null,
    timezoneId: 'UTC',
  });
  const there = await other.newPage();
  await there.clock.setFixedTime(DATE);
  await there.goto('./');
  await expect(there.getByTestId('daily-result')).toHaveCount(0);
  await openSettings(there);
  await there.getByTestId('backup-restore').click();
  await there.getByTestId('restore-file').setInputFiles(path);
  const report = there.getByTestId('restore-result');
  await expect(report).toContainText('2 Daily results added.');
  await expect(report).toContainText('The campaign from slot 1 is now in slot 1.');
  await expect(report).toContainText('Your Endless best, endings found and lessons taken are merged in.');

  // Everything is there, but this browser keeps its own settings (its text size, here).
  await expect(there.getByTestId('daily-result')).toContainText('7/8');
  await expect(there.getByTestId('streak')).toHaveText('Streak 2 · best 2');
  await expect(there.getByTestId('endless-best')).toHaveText('Best: 12 souls');
  await expect(there.locator('html')).toHaveAttribute('style', /font-size: 100%/);
  await there.reload();
  await there.getByTestId('play-campaign').click();
  await expect(there.getByTestId('slot-summary')).toHaveCount(1);
  await there.getByTestId('continue-0').click();
  await expect(there.getByTestId('morning-title')).toHaveText('Day 1');

  // Restoring the same backup again changes nothing.
  await there.getByTestId('campaign-quit').click();
  await there.getByTestId('campaign-back').click();
  await openSettings(there);
  await there.getByTestId('backup-restore').click();
  await there.getByTestId('restore-text').fill(text);
  await there.getByTestId('restore-go').click();
  await expect(report).toContainText('No Daily results new to this device.');
  await expect(report).toContainText(
    "Slot 1: this device's copy of the campaign is as recent as the backup's, so it stays.",
  );
  await other.close();
});

test('text that isn’t a backup is refused, and changes nothing', async ({ page }) => {
  await page.goto('./');
  await openSettings(page);
  await page.getByTestId('backup-restore').click();
  await page.getByTestId('restore-text').fill('{"format":"something else"}');
  await page.getByTestId('restore-go').click();
  await expect(page.getByTestId('restore-result')).toHaveText("That isn't a backup of this game.");
  await page.getByTestId('restore-text').fill('{"format":"cots.backup","v":2,"slots":[]}');
  await page.getByTestId('restore-go').click();
  await expect(page.getByTestId('restore-result')).toHaveText(
    'That backup is from a newer version of the game. Update this one first.',
  );
});

test('a save this version can’t read is kept and shown, never taken for an empty slot', async ({ page }) => {
  const damaged = '{"v":1,"rev":4,"savedAt":1,"save":{"format":"cots.run","v":1,"mornings":[{"da';
  // Readable, but set on a day this build doesn't have: it only fails when opened.
  const strange = {
    v: 1,
    rev: 1,
    savedAt: 1,
    save: {
      format: 'cots.run',
      v: 1,
      engine: 0,
      mornings: [{ day: 99, seed: 'x', rings: 0, family: [] }],
      log: [],
      queue: null,
    },
  };
  await seed(page, { 'cots.campaign.1': damaged, 'cots.campaign.2': strange });
  await page.getByTestId('play-campaign').click();
  await expect(page.getByTestId('unreadable-1')).toContainText("This save can't be read");
  // Slot 1 is free; slot 2 has no New campaign to write over it.
  await expect(page.getByTestId('new-0')).toBeVisible();
  await expect(page.getByTestId('new-1')).toHaveCount(0);

  // The strange one lists, but won't open: it's marked unreadable, and left as it was.
  await page.getByTestId('continue-2').click();
  await expect(page.locator('.toast')).toHaveText("This save wouldn't open. It's kept as it is, marked unreadable.");
  await expect(page.getByTestId('unreadable-2')).toBeVisible();
  await expect(page.getByTestId('new-2')).toHaveCount(0);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('cots.campaign.2'))) ?? 'null')).toEqual(strange);

  // A copy to keep, or to attach to a bug report, holds what was found.
  await page.getByTestId('unreadable-copy-1').click();
  const copy = JSON.parse(await page.getByTestId('unreadable-1-text').inputValue());
  expect(copy).toMatchObject({ format: 'cots.unreadable', slot: 2, found: { mirror: damaged } });

  // It stays as it is across a reload, until it's cleared.
  await page.reload();
  await page.getByTestId('play-campaign').click();
  await expect(page.getByTestId('unreadable-1')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cots.campaign.1'))).toBe(damaged);
  await page.getByTestId('unreadable-clear-1').click();
  await page.getByTestId('unreadable-clear-yes-1').click();
  await expect(page.getByTestId('new-1')).toBeVisible();
  await page.reload();
  await page.getByTestId('play-campaign').click();
  await expect(page.getByTestId('new-1')).toBeVisible();
});

test('the game asks the browser to keep its saves once there is a campaign, and says if it will', async ({ page }) => {
  await page.addInitScript(() => {
    type Stub = { persistCalls: number; kept: boolean };
    type Storage = { persisted: () => Promise<boolean>; persist: () => Promise<boolean> };
    const w = globalThis as unknown as Stub;
    const storage = (navigator as unknown as { storage: Storage }).storage;
    w.persistCalls = 0;
    w.kept = false;
    storage.persisted = async () => w.kept;
    storage.persist = async () => {
      w.persistCalls++;
      w.kept = true;
      return true;
    };
  });
  await page.goto('./');
  await openSettings(page);
  await expect(page.getByTestId('storage-status')).toContainText('This browser may clear your saves');
  await page.getByTestId('play-campaign').click();
  await expect(page.getByTestId('backup-hint')).toBeVisible();
  expect(await page.evaluate(() => (globalThis as unknown as { persistCalls: number }).persistCalls)).toBe(0);

  await page.getByTestId('new-0').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 1');
  expect(await page.evaluate(() => (globalThis as unknown as { persistCalls: number }).persistCalls)).toBe(1);
  await page.getByTestId('campaign-quit').click();
  await expect(page.getByTestId('backup-hint')).toHaveCount(0);
  await page.getByTestId('campaign-back').click();
  await openSettings(page);
  await expect(page.getByTestId('storage-status')).toHaveText('This browser has agreed to keep your saves.');
});
