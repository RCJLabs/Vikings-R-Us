import { type CaseSpec, type Destination, dailySeed, ENGINE_MAJOR, solve, startShift } from '@cots/engine';
import { loadContent, loadDailyContent, scenarioSave } from '@cots/testkit';
import { expect, type Page } from '@playwright/test';
import { type Clip, open, type Size, wait } from './stage';

/*
 * How the game is played to each moment in catalog.ts (docs/tech-spec.md §37), as a player would: the same
 * clicks, on the same souls. The engine works out the right stamps, as it does for the e2e tests.
 */

// Daily #41, the day the pictures are taken on.
const N = 41;
const daily = loadDailyContent();
if (!daily.daily) throw new Error('No Daily in content');
const { state, ctx } = startShift(daily, { mode: 'daily', seed: dailySeed(N), day: daily.daily.day, dailyNumber: N });
const content = loadContent('electron-full');

const soulAt = (i: number): CaseSpec => {
  const c = state.cases[i];
  if (!c) throw new Error(`Daily #${N} has no soul ${i + 1}`);
  return c;
};

// The first soul whose lie confesses when questioned, and the sign on the body that shows the lie up.
const LIAR = state.cases.findIndex((c) => c.lies.some((l) => l.onQuestion === 'confess'));
const liar = (() => {
  const c = soulAt(LIAR);
  const lie = c.lies.find((l) => l.onQuestion === 'confess');
  const x = lie ? solve(c.evidence.fields, ctx).contradictions.find((y) => y.lie === lie.field) : undefined;
  const sign = x?.against.find((id) => id.startsWith('body.'));
  if (!lie || !sign) throw new Error(`Daily #${N} has no confessing liar to catch`);
  return { lie: lie.field, sign };
})();

// Campaign saves made in Node, every earlier soul judged rightly (the e2e tests start the same way).
const saveOn = (seed: string, day: number) => scenarioSave(content, seed, day, ENGINE_MAJOR);

interface SavedSoul {
  readonly script?: string;
  readonly expect: { readonly dest: Destination; readonly procedures?: readonly string[] };
}

const isDrawer = async (page: Page) => (await page.locator('.shift--drawer').count()) > 0;

async function lookAtEverything(page: Page) {
  const look = page.locator('.chip--look');
  while ((await look.count()) > 0) {
    await look.first().click();
    await wait(page, 50);
  }
}

async function stamp(page: Page, dest: Destination) {
  if ((await isDrawer(page)) && (await page.locator('.sheet').count()) === 0) await page.getByTestId('judge').click();
  await page.locator(`[data-dest="${dest}"]`).click();
  await wait(page, 50);
}

async function send(page: Page) {
  await page.getByTestId('send').click();
  await wait(page, 100);
}

/** Judges a soul rightly and sends it on, first using any tool its day asks for (the clippers). */
async function judge(page: Page, c: SavedSoul) {
  if (c.expect.procedures?.includes('proc.clip')) await page.getByTestId('clippers').click();
  await stamp(page, c.expect.dest);
  await send(page);
}

/** Clicks an evidence item, opening its tab first on the phone. */
async function pick(page: Page, field: string) {
  if (await isDrawer(page)) {
    const tab = field.startsWith('testimony.')
      ? 'words'
      : field.startsWith('huginn.') || field.startsWith('muninn.')
        ? 'ravens'
        : null;
    if (tab) await page.locator(`[data-tab="${tab}"]`).click();
  }
  await page.locator(`[data-field="${field}"]`).click();
  await wait(page, 50);
}

async function openDaily(page: Page) {
  await open(page, { seed: 'daily' });
  await page.getByTestId('play-daily').click();
  await wait(page, 100);
  await page.getByTestId('begin').click();
  await wait(page, 800);
  await expect(page.getByTestId('soul-count')).toHaveText(`Soul 1 of ${state.cases.length}`);
}

/** Judges the Daily's souls rightly up to the i-th (from 0). */
async function toSoul(page: Page, i: number) {
  for (const c of state.cases.slice(0, i)) await judge(page, c);
  await expect(page.getByTestId('soul-count')).toHaveText(`Soul ${i + 1} of ${state.cases.length}`);
}

/** Catches the liar: their claim, then the sign that shows it up. */
async function catchLie(page: Page) {
  await pick(page, liar.lie);
  await pick(page, liar.sign);
  await expect(page.locator(`.evidence.is-lie:has([data-field="${liar.lie}"])`)).toBeVisible();
  // On the phone, back to the claim, where Question is.
  if (await isDrawer(page)) await page.locator('[data-tab="words"]').click();
}

/** Plays the scene on screen to its end, taking the first choice each time, and moves on. */
async function playScene(page: Page) {
  await expect(page.getByTestId('scene')).toBeVisible();
  while ((await page.getByTestId('scene-done').count()) === 0) {
    await page.getByTestId('scene-choice').first().click();
    await wait(page, 50);
  }
  await page.getByTestId('scene-done').click();
  await wait(page, 100);
}

/** The shift's queue, as the page saved it when the shift began. */
async function savedQueue(page: Page): Promise<SavedSoul[]> {
  const raw = await page.evaluate<string | null>(`localStorage.getItem('cots.campaign.0')`);
  const record = JSON.parse(raw ?? 'null') as { save: { queue: SavedSoul[] | null } } | null;
  return record?.save.queue ?? [];
}

/** Opens the saved run in the first slot. */
async function openSlot(page: Page, seed: string, save: unknown) {
  await open(page, { seed, save });
  await page.getByTestId('play-campaign').click();
  await wait(page, 100);
  await page.getByTestId('continue-0').click();
  await wait(page, 300);
}

/** From a morning to the gate. */
async function toGate(page: Page) {
  await playScene(page);
  await page.getByTestId('to-gate').click();
  await wait(page, 800);
}

export const STILL_PLAYS: Readonly<Record<string, (page: Page, size: Size) => Promise<void>>> = {
  gate: async (page) => {
    await openDaily(page);
    await lookAtEverything(page);
  },
  caught: async (page) => {
    await openDaily(page);
    await toSoul(page, LIAR);
    await lookAtEverything(page);
    await catchLie(page);
  },
  answer: async (page) => {
    await openDaily(page);
    await toSoul(page, LIAR);
    await lookAtEverything(page);
    await catchLie(page);
    await page.getByTestId('question').first().click();
    await wait(page, 100);
    await expect(page.getByTestId('answer-close')).toBeVisible();
  },
  stamped: async (page) => {
    await openDaily(page);
    await lookAtEverything(page);
    await stamp(page, soulAt(0).expect.dest);
  },
  citation: async (page) => {
    await openDaily(page);
    await lookAtEverything(page);
    const wrong: Destination = soulAt(0).expect.dest === 'HEL' ? 'VALHALLA' : 'HEL';
    await stamp(page, wrong);
    await send(page);
    await expect(page.getByRole('alertdialog')).toBeVisible();
  },
  dusk: async (page) => {
    await openDaily(page);
    await toSoul(page, 5);
    // Most of the sun gone: about 40 seconds of the Daily's six minutes left.
    await wait(page, 318_000);
    await lookAtEverything(page);
    await expect(page.getByTestId('sun')).toHaveText(/^0:[34]\d$/);
  },
  registry: async (page) => {
    // The first seed whose Day 6 opens on an outlaw the registry lists.
    await openSlot(page, 'registry', saveOn('store-registry-0', 6));
    await expect(page.getByTestId('morning-title')).toHaveText('Day 6');
    await toGate(page);
    await lookAtEverything(page);
    await page.getByTestId('registry').click();
    await wait(page, 100);
    // The entry is at the foot of the soul's papers; bring it, portrait and all, into view.
    await page.getByTestId('registry-entry').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('registry-entry')).toBeVisible();
  },
  loki: async (page) => {
    // The vertical slice's own start: a run from Day 12, with the story's Loki in its queue.
    await open(page, { seed: 'loki' });
    await page.getByTestId('play-campaign').click();
    await page.getByTestId('start-fromJump-0').check();
    await page.getByTestId('new-0').click();
    await wait(page, 300);
    await expect(page.getByTestId('morning-title')).toHaveText('Day 12');
    await toGate(page);
    const queue = await savedQueue(page);
    const loki = queue.findIndex((c) => c.script === 'case.loki12');
    if (loki < 0) throw new Error('No Loki in the Day 12 queue');
    for (const c of queue.slice(0, loki)) await judge(page, c);
    // Only the face, where he gives himself away: every sign of a late day's soul would crowd the body out.
    await page.locator('.chip--look[data-region="face"]').click();
    await wait(page, 50);
    await expect(page.locator('.clues')).toContainText('stitch scars');
  },
  morning: async (page) => {
    await openSlot(page, 'morning', saveOn('store-morning', 3));
    await expect(page.getByTestId('morning-title')).toHaveText('Day 3');
    await expect(page.getByTestId('scene-choice').first()).toBeVisible();
  },
  night: async (page) => {
    await openSlot(page, 'night', saveOn('store-night', 5));
    await expect(page.getByTestId('morning-title')).toHaveText('Day 5');
    await toGate(page);
    for (const c of await savedQueue(page)) await judge(page, c);
    await page.getByTestId('go-home').click();
    await wait(page, 300);
    await playScene(page);
    await expect(page.getByTestId('night-title')).toHaveText('Night 5');
  },
  ending: async (page) => {
    await openSlot(page, 'ending', saveOn('store-ending', 21));
    await expect(page.getByTestId('ending-title')).toBeVisible();
  },
};

export const CLIP_PLAYS: Readonly<Record<string, (page: Page, clip: Clip) => Promise<void>>> = {
  'stamp-send': async (page, clip) => {
    await openDaily(page);
    await lookAtEverything(page);
    await clip.start(['.desk__center', '.stamps']);
    await clip.hold(400);
    await page.locator(`[data-dest="${soulAt(0).expect.dest}"]`).click();
    await clip.hold(900);
    await page.getByTestId('send').click();
    await clip.hold(1700);
  },
  'catch-lie': async (page, clip) => {
    await openDaily(page);
    await toSoul(page, LIAR);
    await lookAtEverything(page);
    await clip.start(['.desk__center', '.desk__right']);
    await clip.hold(400);
    await page.locator(`[data-field="${liar.lie}"]`).click();
    await clip.hold(700);
    await page.locator(`[data-field="${liar.sign}"]`).click();
    await clip.hold(1000);
    await page.getByTestId('question').first().click();
    await clip.hold(1600);
  },
  sundown: async (page, clip) => {
    await openDaily(page);
    await lookAtEverything(page);
    await clip.start();
    // Five minutes and forty seconds of sun in four seconds.
    await clip.hold(4000, 85);
  },
};
