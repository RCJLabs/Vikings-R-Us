import { type CaseSpec, type Destination, ENGINE_MAJOR, type RunSave, runContext, stepRun } from '@cots/engine';
import { loadContent, scenarioSave } from '@cots/testkit';
import { expect, type Page, test } from '@playwright/test';
import { FULL } from './urls';

/*
 * Day 6 in the full game: the registry of outlaws. The demo stops at Day 3,
 * so the test starts from a save on Day 6's morning, made in Node with every
 * earlier soul judged rightly, and plays the day like a careful player.
 */

test.use({ baseURL: FULL });

const content = loadContent('dev-full');

function dayQueue(save: RunSave): CaseSpec[] {
  const run = save.mornings[save.mornings.length - 1];
  if (!run) return [];
  const begun = stepRun(run, { t: 'beginShift', at: 0 }, { content, ctx: runContext(content, run) }).state;
  return [...(begun.shift?.cases ?? [])];
}

const registryOf = (c: CaseSpec) => c.evidence.fields.find((f) => f.item === 'registry')?.obs?.value;

// The first seed whose Day 6 has a namesake after the day's first soul.
const { save, queue } = (() => {
  for (let i = 0; i < 40; i++) {
    const s = scenarioSave(content, `e2e-registry-${i}`, 6, ENGINE_MAJOR);
    const q = dayQueue(s);
    if (q.slice(1).some((c) => registryOf(c) === 'namesake')) return { save: s, queue: q };
  }
  throw new Error('No seed in 40 has a namesake on Day 6');
})();

const hairText: Record<string, string> = {
  dark: 'Dark hair',
  fair: 'Fair hair',
  red: 'Red hair',
  grey: 'Grey hair',
};

async function stampAndSend(page: Page, dest: Destination) {
  if ((await page.locator('.shift--drawer').count()) > 0) await page.getByTestId('judge').click();
  await page.locator(`[data-dest="${dest}"]`).click();
  await page.getByTestId('send').click();
}

test('Day 6: the registry names the oathbreaker, and a namesake has other hair', async ({ page }) => {
  await page.addInitScript(
    (record) => localStorage.setItem('cots.campaign.0', record),
    JSON.stringify({ v: 1, rev: 1, savedAt: 0, save }),
  );
  await page.goto('./');
  await page.getByTestId('play-campaign').click();
  await page.getByTestId('continue-0').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 6');
  while ((await page.getByTestId('scene-done').count()) === 0) await page.getByTestId('scene-choice').first().click();
  await page.getByTestId('scene-done').click();
  await expect(page.getByTestId('rulebook-changes')).toContainText('registry');
  await page.getByTestId('to-gate').click();

  // The page made the same queue as Node did.
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cots.campaign.0') ?? 'null')?.save.queue as { id: string }[],
  );
  expect(saved.map((c) => c.id)).toEqual(queue.map((c) => c.id));
  expect(registryOf(queue[0] as CaseSpec)).toBe('listed');

  for (const [i, c] of queue.entries()) {
    const kind = registryOf(c);
    if (i === 0 || kind === 'namesake') {
      await expect(page.getByTestId('soul-count')).toHaveText(`Soul ${i + 1} of ${queue.length}`);
      await page.getByTestId('registry').click();
      const entry = page.getByTestId('registry-entry');
      await expect(entry).toContainText(`${c.evidence.look.name} ${c.evidence.look.patronym}`);
      await expect(entry.locator('.registry__portrait svg')).toBeVisible();
      const own = hairText[String(c.truth.hair)] ?? '';
      if (kind === 'listed') await expect(entry).toContainText(own);
      else await expect(entry).not.toContainText(own);
    }
    await stampAndSend(page, c.expect.dest);
  }
  await expect(page.getByTestId('audit-score')).toHaveText(`${queue.length} of ${queue.length} judged rightly`);
});
