import type { Destination } from '@cots/engine';
import { expect, type Page, test } from '@playwright/test';
import { FULL } from './urls';

/*
 * The vertical slice (M5) in the full build: a run started on its late day
 * (Day 12), through the morning, a shift with the story Loki, the audit and
 * the night, to the slice's ending. The right stamps come from the queue the
 * page saves as the shift begins.
 */

test.use({ baseURL: FULL });

interface SavedSoul {
  readonly script?: string;
  readonly expect: { readonly dest: Destination; readonly procedures?: readonly string[] };
}

const drawer = async (page: Page) => (await page.locator('.shift--drawer').count()) > 0;

async function savedQueue(page: Page, slot: number): Promise<SavedSoul[]> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), `cots.campaign.${slot}`);
  const record = JSON.parse(raw ?? 'null') as { save: { queue: SavedSoul[] | null } } | null;
  return record?.save.queue ?? [];
}

async function playScene(page: Page) {
  const scene = page.getByTestId('scene');
  await expect(scene).toBeVisible();
  while ((await page.getByTestId('scene-done').count()) === 0) await page.getByTestId('scene-choice').first().click();
  await page.getByTestId('scene-done').click();
  await expect(scene).toHaveCount(0);
}

test('the slice from Day 12: Loki in the queue, the stranger at night, the slice ending', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('play-campaign').click();
  await page.getByTestId('start-fromJump-0').check();
  await page.getByTestId('new-0').click();

  await expect(page.getByTestId('morning-title')).toHaveText('Day 12');
  await expect(page.getByTestId('scene')).toContainText('Nine days pass');
  await playScene(page);
  await expect(page.getByTestId('decree')).toContainText('DETAIN');
  await page.getByTestId('to-gate').click();

  const queue = await savedQueue(page, 0);
  const loki = queue.findIndex((c) => c.script === 'case.loki12');
  expect(loki).toBeGreaterThanOrEqual(0);
  expect(queue[loki]?.expect.dest).toBe('DETAIN');
  for (const [i, c] of queue.entries()) {
    await expect(page.getByTestId('soul-count')).toHaveText(`Soul ${i + 1} of ${queue.length}`);
    if (i === loki) {
      await page.locator('.stage .hotspot[data-region="face"]').click();
      await expect(page.locator('.clues')).toContainText('Small stitch scars across the lips');
    }
    if (c.expect.procedures?.includes('proc.clip')) await page.getByTestId('clippers').click();
    if (await drawer(page)) await page.getByTestId('judge').click();
    await page.locator(`[data-dest="${c.expect.dest}"]`).click();
    await page.getByTestId('send').click();
  }

  await expect(page.getByTestId('audit-title')).toHaveText('Day 12: the audit');
  await expect(page.getByTestId('audit-score')).toHaveText(`${queue.length} of ${queue.length} judged rightly`);
  await page.getByTestId('go-home').click();
  await expect(page.getByTestId('scene')).toContainText('Cells are for people who stay in them');
  await playScene(page);
  await page.getByTestId('sleep').click();
  await expect(page.getByTestId('ending-title')).toHaveText('The slice ends here');
});
