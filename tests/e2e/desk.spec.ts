import { type Destination, dailySeed, stampsFor, startShift } from '@cots/engine';
import { loadDailyContent } from '@cots/testkit';
import { expect, type Page, test } from '@playwright/test';

/*
 * The desk's feel (docs/tech-spec.md §33): the stamp's ink, souls walking up and off, papers that can be
 * moved, the sky going down with the sun. None of it may cost a player anything, so these tests play at
 * full speed and check that nothing waited on the motion, and that Reduce motion stills it.
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
const WAY: Partial<Record<Destination, string>> = {
  VALHALLA: 'up',
  FOLKVANGR: 'up',
  HEL: 'down',
  RAN: 'down',
  RETURN: 'back',
};

const isDrawer = async (page: Page) => (await page.locator('.shift--drawer').count()) > 0;

/** Waits for an element's animations (a soul walking up, a paper sliding in) to finish. */
const settled = (page: Page, selector: string) =>
  page.evaluate(
    `Promise.all(document.querySelector(${JSON.stringify(selector)}).getAnimations().map((a) => a.finished)).then(() => true)`,
  );

async function beginDaily(page: Page) {
  await page.goto('./');
  await expect(page.getByTestId('play-daily')).toBeEnabled();
  await page.getByTestId('play-daily').click();
  await page.getByTestId('begin').click();
  await expect(page.getByTestId('soul-count')).toHaveText(`Soul 1 of ${state.cases.length}`);
}

/** Stamps the current soul `dest`: number keys on the desk, the judge sheet on a phone. */
async function stamp(page: Page, dest: Destination) {
  if (await isDrawer(page)) {
    await page.getByTestId('judge').click();
    await page.locator(`[data-dest="${dest}"]`).click();
  } else {
    await page.keyboard.press(String(stamps.indexOf(dest) + 1));
    await expect(page.getByTestId('send')).toBeFocused();
  }
}

async function send(page: Page) {
  if (await isDrawer(page)) await page.getByTestId('send').click();
  else await page.keyboard.press('Enter');
}

/** Records every walking-off copy the page adds from now on: its way, its ink, and what it holds. */
async function watchDepartures(page: Page) {
  await page.evaluate(`(() => {
    window.__departures = [];
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) {
        if (n.nodeType !== 1 || !n.classList.contains('departure')) continue;
        window.__departures.push({
          way: n.dataset.way,
          ink: n.querySelector('.departure__ink')?.textContent ?? null,
          inkClass: n.querySelector('.departure__ink')?.className ?? null,
          hidden: n.getAttribute('aria-hidden'),
          inert: n.hasAttribute('inert'),
          buttons: n.querySelectorAll('button, [data-testid], [data-region], [data-dest], [role]').length,
          art: n.querySelector('.departure__art svg') !== null,
        });
      }
    }).observe(document.body, { childList: true, subtree: true });
  })()`);
}

type Departure = {
  way: string;
  ink: string | null;
  inkClass: string | null;
  hidden: string;
  inert: boolean;
  buttons: number;
  art: boolean;
};
const departures = (page: Page) => page.evaluate<Departure[]>('window.__departures');

test('a fast player loses nothing to the motion: each soul is stamped, inked and sent as it walks up', async ({
  page,
}) => {
  await page.clock.setFixedTime(DATE);
  await beginDaily(page);
  await watchDepartures(page);
  for (const [i, c] of state.cases.entries()) {
    await expect(page.getByTestId('soul-count')).toHaveText(`Soul ${i + 1} of ${state.cases.length}`);
    await stamp(page, c.expect.dest);
    // The stamp leaves its ink on the soul: a picture, over the legs, that takes no clicks.
    const ink = page.locator('.stage .ink');
    await expect(ink).toHaveClass(new RegExp(`ink--${c.expect.dest.toLowerCase()}`));
    await expect(ink).toHaveAttribute('aria-hidden', 'true');
    await expect(ink).toHaveCSS('pointer-events', 'none');
    await send(page);
    // The next soul can be looked at straight away: the copy walking off takes no clicks.
    if (i + 1 < state.cases.length) await page.locator('.chip--look').first().click();
  }
  await expect(page.getByTestId('score')).toHaveText(`${state.cases.length} of ${state.cases.length} judged rightly`);
  // Every soul walked off the way its stamp sent it, with its ink, and as nothing but a picture.
  const gone = await departures(page);
  expect(gone.map((d) => d.way)).toEqual(state.cases.map((c) => WAY[c.expect.dest] ?? 'aside'));
  for (const [i, d] of gone.entries()) {
    const dest = state.cases[i]?.expect.dest ?? '';
    expect(d).toMatchObject({ hidden: 'true', inert: true, buttons: 0, art: true });
    expect(d.inkClass).toContain(`ink--${dest.toLowerCase()}`);
  }
  // And each copy is gone from the page by now.
  await expect(page.locator('.departure')).toHaveCount(0);
});

test('Reduce motion stills the desk: no walking, no sliding, the ink simply there', async ({ page }) => {
  await page.clock.setFixedTime(DATE);
  await page.goto('./');
  await page.locator('.card--settings summary').click();
  await page.getByTestId('setting-motion').check();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.getByTestId('play-daily').click();
  await page.getByTestId('begin').click();
  await watchDepartures(page);
  const c = state.cases[0];
  if (!c) throw new Error('no souls');
  const animations = (selector: string) =>
    page.evaluate<number>(`document.querySelector(${JSON.stringify(selector)}).getAnimations().length`);
  expect(await animations('.stage__frame')).toBe(0);
  await stamp(page, c.expect.dest);
  await expect(page.locator('.stage .ink')).toBeVisible();
  expect(await animations('.stage .ink')).toBe(0);
  await send(page);
  await expect(page.getByTestId('soul-count')).toHaveText(`Soul 2 of ${state.cases.length}`);
  expect(await departures(page)).toEqual([]);

  // The device's own setting does the same, with the game's left off.
  await page.getByTestId('pause').click();
  await page.getByTestId('leave-shift').click();
  await page.locator('.card--settings summary').click();
  await page.getByTestId('setting-motion').uncheck();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByTestId('play-daily').click();
  await page.getByTestId('resume').click();
  await expect(page.getByTestId('soul-count')).toHaveText(`Soul 2 of ${state.cases.length}`);
  await watchDepartures(page);
  const next = state.cases[1];
  if (!next) throw new Error('no second soul');
  await stamp(page, next.expect.dest);
  await send(page);
  await expect(page.getByTestId('soul-count')).toHaveText(`Soul 3 of ${state.cases.length}`);
  expect(await departures(page)).toEqual([]);
});

test('papers can be picked up by their titles, put down anywhere on the desk, and tidied away', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'papers move on the desk layout only');
  await page.goto('./');
  await page.getByTestId('practice-1').click();
  await page.getByTestId('begin').click();
  // Loose papers lie at fractions of the desk, which grows when a lesson's line goes: skip the lesson first.
  await page.getByTestId('coach-skip').click();
  await expect(page.getByTestId('coach')).toHaveCount(0);
  const words = page.locator('.paper--words');
  const title = words.locator('.paper__title');
  await expect(words).not.toHaveClass(/is-loose/);
  await expect(page.getByTestId('tidy')).toHaveCount(0);

  // A click on a title is not a drag.
  await page.locator('.paper--ravens .paper__title').click();
  await expect(page.locator('.paper--ravens')).not.toHaveClass(/is-loose/);

  const before = await title.boundingBox();
  if (!before) throw new Error('no title');
  await page.mouse.move(before.x + 30, before.y + 10);
  await page.mouse.down();
  await page.mouse.move(before.x - 270, before.y + 160, { steps: 10 });
  await page.mouse.up();
  await expect(words).toHaveClass(/is-loose/);
  const after = await title.boundingBox();
  expect(Math.abs((after?.x ?? 0) - (before.x - 300))).toBeLessThan(3);
  expect(Math.abs((after?.y ?? 0) - (before.y + 150))).toBeLessThan(3);
  await expect(page.getByTestId('tidy')).toBeVisible();

  // It stays where it was put for the next soul, and the stamps stay on top of the desk.
  await page.locator('[data-dest="HEL"]').click();
  await page.getByTestId('send').click();
  if (await page.getByTestId('citation-close').count()) await page.getByTestId('citation-close').click();
  await expect(page.getByTestId('soul-count')).toHaveText(/^Soul 2 of /);
  await settled(page, '.paper--words');
  const next = await title.boundingBox();
  expect(Math.abs((next?.x ?? 0) - (after?.x ?? 0))).toBeLessThan(3);
  expect(Math.abs((next?.y ?? 0) - (after?.y ?? 0))).toBeLessThan(3);

  // A double click on its title puts it back in its place.
  await title.dblclick();
  await expect(words).not.toHaveClass(/is-loose/);
  await expect(page.getByTestId('tidy')).toHaveCount(0);

  // Moved again, it's still where it was after a reload, until the desk is tidied.
  const docked = await title.boundingBox();
  if (!docked) throw new Error('no title');
  await page.mouse.move(docked.x + 30, docked.y + 10);
  await page.mouse.down();
  await page.mouse.move(docked.x - 200, docked.y + 100, { steps: 6 });
  await page.mouse.up();
  await expect(words).toHaveClass(/is-loose/);
  await page.reload();
  await page.getByTestId('practice-1').click();
  await page.getByTestId('begin').click();
  await expect(page.locator('.paper--words')).toHaveClass(/is-loose/);
  await page.getByTestId('tidy').click();
  await expect(page.locator('.paper--words')).not.toHaveClass(/is-loose/);
  await expect(page.getByTestId('tidy')).toHaveCount(0);
});

/** The sky's top colour, from its style. */
async function skyTop(page: Page): Promise<[number, number, number]> {
  const style = (await page.locator('.sky').getAttribute('style')) ?? '';
  // The browser writes the colour back as rgb(76, 58, 31).
  const m = /rgb\((\d+),?\s+(\d+),?\s+(\d+)\)/.exec(style);
  if (!m) throw new Error(`no sky colour in "${style}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const brightness = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

test('the sky goes down with the sun', async ({ page }) => {
  await page.clock.install({ time: DATE });
  await beginDaily(page);
  const dawn = await skyTop(page);
  // Four minutes of a six-minute Daily: the sun is low, the sky rose and darker.
  await page.clock.runFor('04:00');
  const late = await skyTop(page);
  expect(brightness(late)).toBeLessThan(brightness(dawn));
  // Past the sun: dusk, darker still.
  await page.clock.runFor('02:30');
  const dusk = await skyTop(page);
  expect(brightness(dusk)).toBeLessThan(brightness(late));
});
