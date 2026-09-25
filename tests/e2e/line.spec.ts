import type { Destination } from '@cots/engine';
import { expect, type Page, test } from '@playwright/test';

/*
 * The line at dusk (docs/tech-spec.md §41) in the web demo. A campaign's seed comes from the clock and
 * Math.random, so pinning both pins the run; the clock is Playwright's, so the sun can be run down at once.
 */

const DATE = new Date('2027-01-10T12:00:00Z');

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

async function playScene(page: Page) {
  await expect(page.getByTestId('scene')).toBeVisible();
  while ((await page.getByTestId('scene-done').count()) === 0) await page.getByTestId('scene-choice').first().click();
  await page.getByTestId('scene-done').click();
  await expect(page.getByTestId('scene')).toHaveCount(0);
}

interface Soul {
  readonly dest: Destination;
  readonly name: string;
  readonly day: number;
}

/** Today's line as saved: where each soul belongs, its name, and the day it came to the gate. */
async function line(page: Page): Promise<Soul[]> {
  const raw = await page.evaluate(() => localStorage.getItem('cots.campaign.0'));
  type Saved = { expect: { dest: Destination }; day: number; evidence: { look: { name: string; patronym: string } } };
  const record = JSON.parse(raw ?? 'null') as { save: { queue: Saved[] | null } } | null;
  return (record?.save.queue ?? []).map((c) => ({
    dest: c.expect.dest,
    name: `${c.evidence.look.name} ${c.evidence.look.patronym}`,
    day: c.day,
  }));
}

test('the sun sets on the line: the souls left wait through the night and come first the next day', async ({
  page,
}) => {
  await page.clock.install({ time: DATE });
  await page.clock.setFixedTime(DATE);
  await page.addInitScript('Math.random = () => 0.01;');
  await page.goto('./');
  await page.getByTestId('play-campaign').click();
  await page.getByTestId('new-0').click();
  await playScene(page);
  await page.getByTestId('to-gate').click();

  const [first, second, ...rest] = await line(page);
  if (!first || !second) throw new Error('Day 1 has too few souls');
  await stampAndSend(page, first.dest);
  await stampAndSend(page, second.dest);
  // The sun sets, and its grace runs out, with the rest still in line.
  await page.clock.fastForward('08:00');
  await expect(page.getByTestId('audit-title')).toHaveText('Day 1: the audit');
  const notes = page.getByTestId('left-note');
  await expect(notes).toHaveCount(rest.length);
  for (const note of await notes.all()) await expect(note).toHaveText('(waits at the gate for tomorrow)');
  // A crowded gate troubles Hel: the line has a column of its own, so the accounts still add up.
  expect(rest.length).toBeGreaterThanOrEqual(3);
  const table = page.getByTestId('standing');
  await expect(table.locator('th').nth(2)).toHaveText('The line');
  await expect(table.locator('tr', { hasText: 'Hel' }).locator('td').nth(2)).toHaveText('-1');

  await page.getByTestId('go-home').click();
  await playScene(page);
  await page.getByTestId('sleep').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 2');
  await playScene(page);
  await expect(page.getByTestId('waiting')).toHaveText(
    `${new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(rest.map((s) => s.name))} waited at the gate through the night and are first in line today, under today's rules.`,
  );

  await page.getByTestId('to-gate').click();
  // Day 2's teaching soul still comes first; then the souls who waited, in the places of the day's last.
  const today = await line(page);
  expect(today.slice(1, 1 + rest.length).map((s) => [s.name, s.day])).toEqual(rest.map((s) => [s.name, 1]));
  await expect(page.getByTestId('waited-banner')).toHaveCount(0);
  await stampAndSend(page, today[0]?.dest ?? 'HEL');
  await expect(page.getByTestId('waited-banner')).toHaveText("Waited at the gate since Day 1. Today's rules decide.");
});
