import { type Destination, dailySeed, solve, stampsFor, startShift } from '@cots/engine';
import { loadContent, loadDailyContent } from '@cots/testkit';
import { expect, type Page, test } from '@playwright/test';
import { FULL } from './urls';

/*
 * Achievements (docs/tech-spec.md §34): kept as they're earned, announced once no shift is running, shown
 * in the title screen's gallery, hidden ones unnamed until found, and earned from records kept before
 * achievements were.
 */

// Daily #41, as daily.spec.ts plays it; the engine works out the right stamps.
const DATE = new Date('2027-01-10T12:00:00Z');
const N = 41;
test.use({ timezoneId: 'UTC' });

const content = loadDailyContent();
const spec = content.daily;
if (!spec) throw new Error('No Daily in content');
const { state, ctx } = startShift(content, { mode: 'daily', seed: dailySeed(N), day: spec.day, dailyNumber: N });
const stamps = stampsFor(ctx);
const DEMO_TOTAL = (loadContent('web-demo').achievements ?? []).length;
const FULL_TOTAL = (loadContent('dev-full').achievements ?? []).length;

// The first soul whose lie confesses when questioned, and what shows the lie up.
const LIAR = state.cases.findIndex((c) => c.lies.some((l) => l.onQuestion === 'confess'));
const liar = (() => {
  const c = state.cases[LIAR];
  const lie = c?.lies.find((l) => l.onQuestion === 'confess');
  const x = c && lie ? solve(c.evidence.fields, ctx).contradictions.find((y) => y.lie === lie.field) : undefined;
  const other = x?.against.find((id) => id.startsWith('body.'));
  if (!lie || !other) throw new Error(`no confessing liar to call out in Daily #${N}`);
  return { lie: lie.field, with: other };
})();

const isDrawer = async (page: Page) => (await page.locator('.shift--drawer').count()) > 0;

/** Stamps and sends the current soul: number keys and Enter on the desk, the judge sheet on a phone. */
async function judge(page: Page, dest: Destination) {
  if (await isDrawer(page)) {
    await page.getByTestId('judge').click();
    await page.locator(`[data-dest="${dest}"]`).click();
    await page.getByTestId('send').click();
  } else {
    await page.keyboard.press(String(stamps.indexOf(dest) + 1));
    await expect(page.getByTestId('send')).toBeFocused();
    await page.keyboard.press('Enter');
  }
}

/** Calls out the liar's lie and questions them, as daily.spec.ts's careful player does. */
async function askNicely(page: Page) {
  const look = page.locator('.chip--look');
  while ((await look.count()) > 0) await look.first().click();
  const pick = async (id: string) => {
    if ((await isDrawer(page)) && id.startsWith('testimony.')) await page.locator('[data-tab="words"]').click();
    await page.locator(`[data-field="${id}"]`).click();
  };
  await pick(liar.lie);
  await pick(liar.with);
  await expect(page.locator(`.evidence.is-lie:has([data-field="${liar.lie}"])`)).toBeVisible();
  if (await isDrawer(page)) await page.locator('[data-tab="words"]').click();
  await page.getByTestId('question').first().click();
  await expect(page.getByTestId('answer-close')).toBeFocused();
  await page.getByTestId('answer-close').click();
}

async function openGallery(page: Page) {
  const gallery = page.getByTestId('achievements');
  if (!(await gallery.evaluate((el) => (el as unknown as { open: boolean }).open))) {
    await gallery.locator('summary').click();
  }
  return gallery;
}

const kept = (page: Page) =>
  page.evaluate<string[]>(`Object.keys(JSON.parse(localStorage.getItem('cots.settings') ?? '{}').achievements ?? {})`);

test('what a Daily earns is kept at once and announced when the shift is over', async ({ page }) => {
  await page.clock.setFixedTime(DATE);
  await page.goto('./');
  const gallery = await openGallery(page);
  await expect(gallery.getByTestId('achievements-count')).toHaveText(`0 of ${DEMO_TOTAL}`);
  await expect(gallery.locator('[data-id="ach.cleanSlate"]')).toContainText('Not yet earned');

  await page.getByTestId('play-daily').click();
  await page.getByTestId('begin').click();
  for (const [i, c] of state.cases.entries()) {
    await expect(page.getByTestId('soul-count')).toHaveText(`Soul ${i + 1} of ${state.cases.length}`);
    if (i === LIAR) await askNicely(page);
    await judge(page, c.expect.dest);
    if (i === LIAR) {
      // Earned as the liar was sent, and kept, but nothing covers the desk while the sun runs.
      await expect(page.getByTestId('soul-count')).toHaveText(`Soul ${i + 2} of ${state.cases.length}`);
      await expect.poll(() => kept(page)).toEqual(['ach.askedNicely']);
      await expect(page.getByTestId('achievement-note')).toHaveCount(0);
    }
  }
  await expect(page.getByTestId('score')).toHaveText(`${state.cases.length} of ${state.cases.length} judged rightly`);

  // The summary announces it all, to screen readers too, and takes no clicks.
  const note = page.getByTestId('achievement-note');
  for (const title of ['Asked nicely', 'Clean slate', "Nobody's help", 'Home before dark']) {
    await expect(note).toContainText(title);
  }
  await expect(page.locator('.award-region')).toHaveAttribute('role', 'status');
  await expect(page.locator('.award-region')).toHaveCSS('pointer-events', 'none');

  await page.getByTestId('home').click();
  const after = await openGallery(page);
  await expect(after.getByTestId('achievements-count')).toHaveText(`4 of ${DEMO_TOTAL}`);
  for (const id of ['ach.askedNicely', 'ach.cleanSlate', 'ach.nobodysHelp', 'ach.homeBeforeDark']) {
    await expect(after.locator(`[data-id="${id}"]`)).toHaveClass(/is-earned/);
    await expect(after.locator(`[data-id="${id}"]`)).toContainText(/Earned .*2027/);
  }
  await expect(after.locator('[data-id="ach.lastLight"]')).not.toHaveClass(/is-earned/);

  // Kept on the device, and not announced again.
  await page.reload();
  await expect(page.getByTestId('play-daily')).toBeEnabled();
  const again = await openGallery(page);
  await expect(again.getByTestId('achievements-count')).toHaveText(`4 of ${DEMO_TOTAL}`);
  await expect(page.getByTestId('achievement-note')).toHaveCount(0);
});

test.describe('the full game', () => {
  test.use({ baseURL: FULL });

  test('keeps hidden achievements unnamed until found, and counts what earlier records show', async ({ page }) => {
    await page.goto('./');
    const gallery = await openGallery(page);
    await expect(gallery.getByTestId('achievements-count')).toHaveText(`0 of ${FULL_TOTAL}`);
    const odin = gallery.locator('[data-id="ach.odin"]');
    await expect(odin).toContainText('Hidden');
    await expect(odin).not.toContainText('Chooser eternal');

    // An ending found and an Endless best from before achievements were kept.
    await page.evaluate(
      `localStorage.setItem('cots.settings', JSON.stringify({ v: 1, endingsSeen: ['ending.odin'], endlessBest: 30 }))`,
    );
    await page.reload();
    const note = page.getByTestId('achievement-note');
    await expect(note).toContainText('Chooser eternal');
    await expect(note).toContainText('The long watch');
    const now = await openGallery(page);
    await expect(now.getByTestId('achievements-count')).toHaveText(`2 of ${FULL_TOTAL}`);
    await expect(now.locator('[data-id="ach.odin"]')).toContainText('Chooser eternal');
    await expect(now.locator('[data-id="ach.odin"]')).toHaveClass(/is-earned/);
    // A best of 30 says nothing about strikes: the clean run isn't guessed at.
    await expect(now.locator('[data-id="ach.notAScratch"]')).not.toHaveClass(/is-earned/);
  });
});
