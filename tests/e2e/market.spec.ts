import AxeBuilder from '@axe-core/playwright';
import {
  armsTonight,
  type Content,
  campaignOf,
  ENGINE_MAJOR,
  fight,
  type RunSave,
  type RunState,
  resumeSave,
  sellPrice,
} from '@cots/engine';
import { loadContent, scenarioSave } from '@cots/testkit';
import { expect, type Page, test } from '@playwright/test';
import { FULL } from './urls';

/*
 * Rings with a job late in the run, and a softer bottom (docs/tech-spec.md §56): arms for the last battle, bought a lot
 * a night in the full game; upgrades sold back at night; and Skögul's reprieve from the debt that would end a run.
 */

const full = loadContent('dev-full');
const demo = loadContent('web-demo');

async function expectAccessible(page: Page) {
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
}

/** A save on `day`'s night, every soul judged rightly, its day begun with `change`. */
function nightSave(content: Content, seed: string, day: number, change: Partial<RunState>): RunSave {
  const base = scenarioSave(content, seed, day, ENGINE_MAJOR, 'night');
  const morning = base.mornings.at(-1) as RunState;
  return { ...base, mornings: [...base.mornings.slice(0, -1), { ...morning, ...change }] };
}

/** Continues `save` from the first slot, past the night's scene if it has one. */
async function continueNight(page: Page, save: RunSave, day: number) {
  await page.addInitScript(
    (record) => localStorage.setItem('cots.campaign.0', record),
    JSON.stringify({ v: 1, rev: 1, savedAt: 0, save }),
  );
  await page.goto('./');
  await page.getByTestId('play-campaign').click();
  await page.getByTestId('continue-0').click();
  await expect(page.getByTestId('night-title')).toHaveText(`Night ${day}`);
  if ((await page.getByTestId('scene').count()) > 0) {
    while ((await page.getByTestId('scene-done').count()) === 0) await page.getByTestId('scene-choice').first().click();
    await page.getByTestId('scene-done').click();
  }
  await expect(page.getByTestId('sleep')).toBeVisible();
}

test.describe('the full game', () => {
  test.use({ baseURL: FULL });
  const arms = campaignOf(full).arms;
  const def = campaignOf(full).ragnarok;

  test('sells arms for the last battle: a lot a night, for the front you choose, each front as it stands', async ({
    page,
  }) => {
    if (!arms || !def) throw new Error('the full game sells arms for its last battle');
    const save = nightSave(full, 'e2e-arms', arms.from, { rings: 400 });
    const night = resumeSave(save, full, ENGINE_MAJOR).run;
    const lot = armsTonight(night, full);
    expect(lot).toEqual({ price: arms.prices[0], strength: arms.strength, bought: false });
    const ids = def.fronts.map((f) => f.id);
    const gateAt = (run: RunState) => fight(run, def, ids).fronts.find((f) => f.id === 'front.gate');
    const before = gateAt(night);
    const after = gateAt({ ...night, armed: { 'front.gate': arms.strength } });
    if (!lot || !before || !after) throw new Error('the gate is a front');

    await continueNight(page, save, arms.from);
    const card = page.getByTestId('arms');
    await expect(card.getByTestId('arms-front')).toHaveCount(arms.fronts.length);
    const gate = card.locator('[data-front="front.gate"]');
    await expect(gate).toContainText(
      `For Hel's gate. If the horn blew tonight it would ${before.held ? 'hold' : 'fall'}, ${before.strength} against ${before.foe}.`,
    );
    await expect(gate.getByTestId('arm-front.gate')).toHaveText(`Buy for ${lot.price} rings`);
    await expectAccessible(page);

    // Bought: the rings are gone, tonight's lot is sold, and the gate counts it.
    await gate.getByTestId('arm-front.gate').click();
    await expect(page.getByTestId('night-rings')).toHaveText(`${night.rings - lot.price} rings in your purse`);
    await expect(card.getByTestId('arms-tonight')).toHaveText(
      "You've bought tonight's lot. The quartermaster opens again tomorrow night.",
    );
    for (const id of ids) await expect(card.getByTestId(`arm-${id}`)).toBeDisabled();
    await expect(card.getByTestId('arms-bought')).toHaveText(`1 lot bought so far, of ${arms.prices.length}.`);
    await expect(gate).toContainText(
      `If the horn blew tonight it would ${after.held ? 'hold' : 'fall'}, ${after.strength} against ${after.foe}, ${arms.strength} of it arms.`,
    );
    await expectAccessible(page);
  });

  test('counts the arms bought at their front when the horn blows', async ({ page }) => {
    if (!arms || !def) throw new Error('the full game sells arms for its last battle');
    const last = campaignOf(full).lastDay;
    const save = nightSave(full, 'e2e-arms-horn', last, { armed: { 'front.ship': 2 * arms.strength }, armsBought: 2 });
    await continueNight(page, save, last);
    await page.getByTestId('sleep').click();
    await expect(page.getByTestId('ragnarok-title')).toHaveText('Ragnarök');
    await expect(page.locator('[data-testid="front"][data-front="front.ship"]')).toContainText(
      `arms ${2 * arms.strength}`,
    );
  });
});

test('an upgrade sells back at night for its share of the price, and is for sale again', async ({ page }) => {
  const item = campaignOf(demo).shop.find((u) => u.id === 'up.meadHorn');
  if (!item) throw new Error('the demo sells the horn of mead');
  const save = nightSave(demo, 'e2e-sell', 1, { upgrades: [item.id] });
  const night = resumeSave(save, demo, ENGINE_MAJOR).run;
  const n = sellPrice(night, demo, item.id);
  expect(n).toBe(Math.floor((item.price * (campaignOf(demo).sellBack ?? 0)) / 100));

  await continueNight(page, save, 1);
  const sell = page.getByTestId('owned').getByTestId(`sell-${item.id}`);
  await expect(sell).toHaveText(`Sell for ${n} rings`);
  await expect(sell).toHaveAttribute('aria-label', `Sell Horn of mead back for ${n} rings`);
  await expect(page.getByTestId(`buy-${item.id}`)).toHaveCount(0);
  await expectAccessible(page);

  await sell.click();
  await expect(page.getByTestId('night-rings')).toHaveText(`${night.rings + (n ?? 0)} rings in your purse`);
  await expect(page.getByTestId('owned')).toHaveCount(0);
  await expect(page.getByTestId(`buy-${item.id}`)).toBeVisible();
});

test('Skögul pays the debt that would end the run, once, and the morning says so', async ({ page }) => {
  // A second night deep below the debt floor, with the reprieve still to come.
  const save = nightSave(demo, 'e2e-reprieve', 1, { rings: -200, debtNights: 1 });
  await continueNight(page, save, 1);
  await expect(page.getByTestId('reprieve-note')).toHaveText(
    "Tonight's debt would cost you your wings, but Skögul will pay it, this once.",
  );
  await expect(page.getByTestId('after-bills')).toHaveText('After tonight: 0 rings');
  await expect(page.getByTestId('debt-warning')).toHaveCount(0);
  await expectAccessible(page);

  // No warning before sleeping: the run goes on, the purse empty and the debt paid.
  await page.getByTestId('sleep').click();
  await expect(page.getByTestId('morning-title')).toHaveText('Day 2');
  await expect(page.getByTestId('night-news')).toContainText(
    "Skögul paid the quartermaster last night, before he could take your wings. She wrote it in her book. It won't happen twice.",
  );
  await expect(page.getByTestId('debt-banner')).toHaveCount(0);
});
