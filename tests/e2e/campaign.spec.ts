import type { Destination } from '@cots/engine';
import { expect, type Page, test } from '@playwright/test';

/*
 * The demo's campaign (Days 1-3), played end to end in the built web demo.
 * The right stamps come from the saved queue in localStorage, which the page
 * writes as the shift begins but never shows.
 */

const drawer = (page: Page) =>
  page
    .locator('.shift--drawer')
    .count()
    .then((n) => n > 0);

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

/** Plays the scene on screen up to its end, taking a preferred choice when offered, else the first. */
async function readScene(page: Page, prefer: readonly string[] = []) {
  await expect(page.getByTestId('scene')).toBeVisible();
  while ((await page.getByTestId('scene-done').count()) === 0) {
    const choices = page.getByTestId('scene-choice');
    const texts = (await choices.allTextContents()).map((s) => s.trim());
    await choices
      .nth(
        Math.max(
          0,
          texts.findIndex((s) => prefer.includes(s)),
        ),
      )
      .click();
  }
}

/** Plays the scene on screen and moves on. */
async function playScene(page: Page, prefer: readonly string[] = []) {
  await readScene(page, prefer);
  await page.getByTestId('scene-done').click();
  await expect(page.getByTestId('scene')).toHaveCount(0);
}

async function openCampaign(page: Page) {
  await page.goto('./');
  await page.getByTestId('play-campaign').click();
  await expect(page.getByTestId('campaign-title')).toBeVisible();
}

async function judgeAll(page: Page, slot: number, skipLast = 0) {
  const answers = await savedAnswers(page, slot);
  expect(answers.length).toBeGreaterThan(0);
  for (const dest of answers.slice(0, answers.length - skipLast)) await stampAndSend(page, dest);
  return answers;
}

test('a first day: morning scene, a shift judged rightly, the audit, the night, and Day 2 after a reload', async ({
  page,
}) => {
  await openCampaign(page);
  await page.getByTestId('new-0').click();

  await expect(page.getByTestId('morning-title')).toHaveText('Day 1');
  await expect(page.getByTestId('scene-draft')).toBeVisible();
  await expect(page.getByTestId('scene')).toContainText('Skögul');
  await playScene(page);
  await expect(page.getByTestId('decree')).toContainText('weapon in hand');
  await page.getByTestId('to-gate').click();

  await expect(page.getByTestId('soul-count')).toHaveText('Soul 1 of 6');
  const answers = await judgeAll(page, 0);

  await expect(page.getByTestId('audit-title')).toHaveText('Day 1: the audit');
  await expect(page.getByTestId('audit-score')).toHaveText(`${answers.length} of ${answers.length} judged rightly`);
  // 10 rings to start, 5 for each soul judged rightly.
  await expect(page.getByTestId('audit-rings')).toHaveText(String(10 + 5 * answers.length));
  await page.getByTestId('go-home').click();

  await expect(page.getByTestId('night-title')).toHaveText('Night 1');
  await playScene(page);
  // The journal keeps the day's scenes, the choices made in them, and letters once read.
  await page.getByTestId('journal-open').click();
  await expect(page.getByTestId('journal-day')).toHaveCount(1);
  await expect(page.getByTestId('journal-scene')).toHaveCount(2);
  await expect(page.getByTestId('journal-scene').first()).toContainText('Skögul');
  await expect(page.getByTestId('journal').locator('.scene__line--chosen')).toHaveCount(2);
  await page.getByTestId('journal-close').click();
  await expect(page.getByTestId('journal')).toHaveCount(0);
  // Hearth 6, food 3 for each of three: 40 - 15.
  await expect(page.getByTestId('after-bills')).toHaveText('After tonight: 25 rings');
  await page.getByTestId('buy-up.meadHorn').click();
  await expect(page.getByTestId('owned')).toContainText('Horn of mead');
  await expect(page.getByTestId('after-bills')).toHaveText('After tonight: 10 rings');
  await page.getByTestId('sleep').click();

  await expect(page.getByTestId('morning-title')).toHaveText('Day 2');
  await page.reload();
  await openCampaign(page);
  await expect(page.getByTestId('slot-0').getByTestId('slot-summary')).toHaveText('Day 2 · 10 rings · 3 of 3 at home');
  await page.getByTestId('continue-0').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 2');
  await expect(page.getByTestId('scene')).toBeVisible();
  // After a reload the journal still has Day 1 (today has nothing in it yet, so Day 1 is open).
  await page.getByTestId('journal-open').click();
  await expect(page.getByTestId('journal-day').locator('summary')).toHaveText(['Day 1']);
  await expect(page.getByTestId('journal-scene')).toHaveCount(2);
  await page.getByTestId('journal-close').click();
  await expect(page.getByTestId('scene')).toBeVisible();
});

test('a day can be replayed in a new slot, keeping the run it came from', async ({ page }) => {
  await openCampaign(page);
  await page.getByTestId('new-0').click();
  await playScene(page);
  await page.getByTestId('to-gate').click();
  await judgeAll(page, 0);
  await page.getByTestId('go-home').click();
  await playScene(page);
  await page.getByTestId('sleep').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 2');
  await page.getByTestId('campaign-quit').click();

  await page.getByTestId('replay-day-0').selectOption('1');
  await page.getByTestId('branch-0').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 1');
  await page.getByTestId('campaign-quit').click();
  await expect(page.getByTestId('slot-0').getByTestId('slot-summary')).toContainText('Day 2');
  await expect(page.getByTestId('slot-1').getByTestId('slot-summary')).toContainText('Day 1');
});

test('an option the purse can’t cover stays in sight, locked, with what it needs', async ({ page }) => {
  await openCampaign(page);
  await page.getByTestId('new-1').click();
  await playScene(page);
  await page.getByTestId('to-gate').click();
  await judgeAll(page, 1);
  await page.getByTestId('go-home').click();
  await playScene(page);
  await page.getByTestId('sleep').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 2');
  // Empty the purse in the saved Day 2 morning, so tonight's letter asks for five rings the run hasn't got.
  await page.evaluate((key) => {
    const record = JSON.parse(localStorage.getItem(key) ?? 'null');
    record.rev += 1;
    record.save.mornings[record.save.mornings.length - 1].rings = -100;
    localStorage.setItem(key, JSON.stringify(record));
  }, 'cots.campaign.1');
  await page.reload();
  await openCampaign(page);
  await page.getByTestId('continue-1').click();
  await playScene(page);
  await page.getByTestId('to-gate').click();
  await judgeAll(page, 1);
  await page.getByTestId('go-home').click();
  const locked = page.getByTestId('scene-choice-locked');
  await expect(locked).toHaveCount(1);
  await expect(locked).toBeDisabled();
  await expect(locked).toContainText(/Send five rings\. \(5 rings; you have -\d+\)/);
  // What the purse holds is weighed against tonight's bills: firewood 6 and food for three, 9.
  await expect(page.getByTestId('scene-purse')).toHaveText(
    /^You have -\d+ rings\. Tonight's bills come to 15 if you pay them all\.$/,
  );
  await page.getByTestId('scene-choice').first().click();
  await expect(page.getByTestId('scene-done')).toBeVisible();
});

test('a reload mid-shift resumes paused on the same soul; a day can be replayed from its morning', async ({ page }) => {
  await openCampaign(page);
  await page.getByTestId('new-1').click();
  await playScene(page);
  await page.getByTestId('to-gate').click();
  const answers = await savedAnswers(page, 1);
  await stampAndSend(page, answers[0] as Destination);
  await stampAndSend(page, answers[1] as Destination);
  await expect(page.getByTestId('soul-count')).toHaveText(`Soul 3 of ${answers.length}`);

  await page.reload();
  await openCampaign(page);
  await page.getByTestId('continue-1').click();
  await expect(page.getByTestId('resume')).toBeVisible();
  await page.getByTestId('resume').click();
  await expect(page.getByTestId('soul-count')).toHaveText(`Soul 3 of ${answers.length}`);
  expect(await savedAnswers(page, 1)).toEqual(answers);

  await page.getByTestId('pause').click();
  await page.getByTestId('save-quit').click();
  await expect(page.getByTestId('campaign-title')).toBeVisible();
  await page.getByTestId('replay-1').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 1');
  await expect(page.getByTestId('scene')).toBeVisible();
});

test('Story Mode keeps no sun, and the demo ends after Day 3; standing shows what choices and mistakes did', async ({
  page,
}) => {
  test.slow();
  await openCampaign(page);
  await page.getByTestId('story-2').check();
  await page.getByTestId('new-2').click();
  for (let day = 1; day <= 3; day++) {
    await expect(page.getByTestId('morning-title')).toHaveText(`Day ${day}`);
    if (day === 1) {
      // Picking up the stamp pleases Odin, and the scene says so before it ends.
      await expect(page.getByTestId('standing-strip')).toHaveCount(0);
      await readScene(page, ['Pick up the stamp.']);
      await expect(page.getByTestId('scene-note')).toHaveText(['Odin will remember that (+1).']);
      await page.getByTestId('scene-done').click();
      await expect(page.getByTestId('standing-strip')).toHaveText('Standing: Odin +1');
    } else {
      await playScene(page);
    }
    await expect(page.locator('.briefing__queue')).toHaveText('Story Mode: the sun waits for you.');
    await page.getByTestId('to-gate').click();
    await expect(page.getByTestId('sun')).toHaveText('No sun');
    // One mistake a day: Story Mode never fines.
    const answers = await savedAnswers(page, 2);
    const [first, ...rest] = answers;
    await stampAndSend(page, first === 'HEL' ? 'VALHALLA' : 'HEL');
    await page.getByTestId('citation-close').click();
    for (const dest of rest) await stampAndSend(page, dest);
    await expect(page.getByTestId('audit-title')).toHaveText(`Day ${day}: the audit`);
    await expect(page.getByTestId('ledger')).not.toContainText('Fines');
    if (day === 1) {
      // The mistake cost Odin what the choice gave him: the columns add up to where he stands now.
      const odin = page.getByTestId('standing').locator('tr', { hasText: 'Odin' }).locator('td');
      await expect(odin).toHaveText(['Odin', '-1', '+1', '0']);
    }
    await page.getByTestId('go-home').click();
    if (day === 3) {
      // The stranger at night is Loki, but the game doesn't say so yet.
      await readScene(page, ['Say nothing.']);
      await expect(page.getByTestId('scene-note')).toHaveText(['The stranger will remember that (+1).']);
      await page.getByTestId('scene-done').click();
      await expect(page.getByTestId('standing-strip')).toContainText('The stranger +1');
      await expect(page.getByTestId('standing-strip')).not.toContainText('Loki');
    } else {
      await playScene(page);
    }
    await page.getByTestId('sleep').click();
  }
  await expect(page.getByTestId('ending-title')).toHaveText('The demo ends here');
  // The report: where the powers stood and where the souls went (the demo's endings don't read the host).
  await expect(page.getByTestId('ending-found-count')).toHaveText('1 of 3 endings found on this device.');
  await expect(page.getByTestId('final-standing')).toContainText('Odin');
  await expect(page.getByTestId('sent')).toContainText('Valhalla');
  await expect(page.getByTestId('host')).toHaveCount(0);
  // The gallery names the ending found, and not the others.
  await page.getByTestId('ending-slots').click();
  await expect(page.getByTestId('endings-count')).toHaveText('1 of 3 endings found on this device.');
  await expect(page.getByTestId('ending-found').locator('summary')).toHaveText(['The demo ends here']);
  await expect(page.getByTestId('ending-unfound')).toHaveCount(2);
});
