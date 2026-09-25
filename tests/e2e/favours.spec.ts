import {
  type CaseSpec,
  type Destination,
  ENGINE_MAJOR,
  type RunSave,
  type RunState,
  runContext,
  solve,
  stepRun,
} from '@cots/engine';
import { loadContent, scenarioSave } from '@cots/testkit';
import { expect, type Page, test } from '@playwright/test';
import { FULL } from './urls';

/*
 * The gods' favour (docs/tech-spec.md §43) in the full game: a save on Day 5's morning, made in Node with every
 * earlier soul judged rightly, and every god's standing then set at its favour's mark. The day is played with a
 * liar questioned and three souls sent wrong, so there's a fine for the clerk to halve.
 */

test.use({ baseURL: FULL });

const content = loadContent('dev-full');
const favours = content.campaign?.favours ?? [];

function withStanding(base: RunSave): RunSave {
  const morning = base.mornings[base.mornings.length - 1] as RunState;
  const standing = { ...morning.standing };
  for (const f of favours) standing[f.faction] = f.at;
  return { ...base, mornings: [...base.mornings.slice(0, -1), { ...morning, standing }] };
}

function dayQueue(save: RunSave): { queue: CaseSpec[]; run: RunState } {
  const run = save.mornings[save.mornings.length - 1] as RunState;
  const begun = stepRun(run, { t: 'beginShift', at: 0 }, { content, ctx: runContext(content, run) }).state;
  return { queue: [...(begun.shift?.cases ?? [])], run };
}

// The first seed whose Day 5 has a liar who confesses to a lie a body sign gives away.
const { save, queue, liarAt, liar, sunS } = (() => {
  for (let i = 0; i < 20; i++) {
    const s = withStanding(scenarioSave(content, `e2e-favour-${i}`, 5, ENGINE_MAJOR));
    const { queue: q, run } = dayQueue(s);
    const ctx = runContext(content, run);
    for (const [at, c] of q.entries()) {
      const lie = c.lies.find((l) => l.onQuestion === 'confess');
      const x = lie ? solve(c.evidence.fields, ctx).contradictions.find((y) => y.lie === lie.field) : undefined;
      const other = x?.against.find((id) => id.startsWith('body.'));
      if (lie && other && at > 0) {
        return { save: s, queue: q, liarAt: at, liar: { lie: lie.field, with: other }, sunS: ctx.spec.sunS };
      }
    }
  }
  throw new Error('No seed in 20 has a liar to question on Day 5');
})();

const isDrawer = async (page: Page) => (await page.locator('.shift--drawer').count()) > 0;

async function stampAndSend(page: Page, dest: Destination) {
  if (await isDrawer(page)) await page.getByTestId('judge').click();
  await page.locator(`[data-dest="${dest}"]`).click();
  await page.getByTestId('send').click();
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

test("the gods' favour: granted at the gate, spent at the desk, the audit and the night", async ({ page }) => {
  await page.addInitScript(
    (record) => localStorage.setItem('cots.campaign.0', record),
    JSON.stringify({ v: 1, rev: 1, savedAt: 0, save }),
  );
  await page.goto('./');
  await page.getByTestId('play-campaign').click();
  await page.getByTestId('continue-0').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 5');
  while ((await page.getByTestId('scene-done').count()) === 0) await page.getByTestId('scene-choice').first().click();
  await page.getByTestId('scene-done').click();

  // Every favour today, and Odin's minute is in the day's sun.
  await expect(page.getByTestId('favour-today')).toHaveText([
    "Odin's favour today: the sun holds a minute longer at the gate.",
    "Freyja's favour today: your first question of the day costs no sun.",
    "Hel's favour today: the sick at home hold out a night longer without medicine.",
    "The clerk's favour today: your fines are halved.",
  ]);
  await expect(page.getByText(`The sun sets in ${clock(sunS + 60)}.`)).toBeVisible();
  // The guide says what each god grants, at what standing, and whose are yours.
  await page.getByTestId('favours').locator('summary').click();
  await expect(page.getByTestId('favour')).toHaveCount(favours.length);
  await expect(page.getByTestId('favour').first()).toContainText('Odin, at standing 4 (now +4)');
  await expect(page.getByTestId('favour').first()).toContainText('Yours today.');

  await page.getByTestId('to-gate').click();
  const saved = await page.evaluate<{ id: string }[]>(
    `JSON.parse(localStorage.getItem('cots.campaign.0') ?? 'null')?.save.queue ?? []`,
  );
  expect(saved.map((c) => c.id)).toEqual(queue.map((c) => c.id));
  // Three souls sent wrong before the liar: two warnings, then a fine.
  const wrong = new Set(queue.flatMap((_, i) => (i !== liarAt ? [i] : [])).slice(0, 3));
  for (const [i, c] of queue.entries()) {
    if (i === liarAt) {
      const look = page.locator('.chip--look');
      while ((await look.count()) > 0) await look.first().click();
      for (const id of [liar.lie, liar.with]) {
        if ((await isDrawer(page)) && id.startsWith('testimony.')) await page.locator('[data-tab="words"]').click();
        await page.locator(`[data-field="${id}"]`).click();
      }
      if (await isDrawer(page)) await page.locator('[data-tab="words"]').click();
      // Freyja's: the day's first question costs no sun.
      await expect(page.getByTestId('question').first()).toHaveText('Question (free today)');
      await page.getByTestId('question').first().click();
      await page.getByTestId('answer-close').click();
    }
    if (wrong.has(i)) {
      await stampAndSend(page, c.expect.dest === 'HEL' ? 'VALHALLA' : 'HEL');
      await page.getByTestId('citation-close').click();
    } else await stampAndSend(page, c.expect.dest);
  }

  // The clerk's: the fine for the third mistake, halved (rounding down).
  await expect(page.getByTestId('audit-title')).toHaveText('Day 5: the audit');
  const economy = runContext(content, save.mornings[save.mornings.length - 1] as RunState).spec.economy;
  const fine = Math.floor((economy?.fines[0] ?? 0) / 2);
  await expect(page.getByTestId('ledger').locator('tr', { hasText: 'Fines' }).locator('td').nth(1)).toHaveText(
    `-${fine}`,
  );
  await expect(page.getByTestId('favour-fines')).toHaveText("The clerk's favour today: your fines are halved.");

  // Hel's holds for the night, whatever the day's mistakes did to her standing.
  await page.getByTestId('go-home').click();
  await expect(page.getByTestId('night-rings')).toBeVisible();
  if ((await page.getByTestId('scene').count()) > 0) {
    while ((await page.getByTestId('scene-done').count()) === 0) await page.getByTestId('scene-choice').first().click();
    await page.getByTestId('scene-done').click();
  }
  await expect(page.getByTestId('favour-tonight')).toHaveText(
    "Hel's favour tonight: the sick at home hold out a night longer without medicine.",
  );
});
