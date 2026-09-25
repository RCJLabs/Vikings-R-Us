import { dailySeed, stampsFor, startShift } from '@cots/engine';
import { loadDailyContent } from '@cots/testkit';
import { expect, type Page, test } from '@playwright/test';
import { FULL } from './urls';

/*
 * Playing with a controller (docs/tech-spec.md §36). No real one is plugged in: the page's
 * navigator.getGamepads is swapped, before it loads, for one that returns a standard pad the test holds
 * the buttons of, frame by frame, as a player would.
 */

// Daily #41, as daily.spec.ts plays it; the engine works out the right stamps.
const DATE = new Date('2027-01-10T12:00:00Z');
const N = 41;
test.use({ timezoneId: 'UTC', contextOptions: { reducedMotion: 'reduce' } });

const content = loadDailyContent();
const spec = content.daily;
if (!spec) throw new Error('No Daily in content');
const { state, ctx } = startShift(content, { mode: 'daily', seed: dailySeed(N), day: spec.day, dailyNumber: N });
const stamps = stampsFor(ctx);

/** A standard pad, unplugged until `plugIn`: `window.__pad`, whose buttons and axes the test sets. */
const FAKE_PAD = `(() => {
  const pad = {
    id: 'Test pad (STANDARD GAMEPAD Vendor: 28de Product: 11ff)',
    index: 0,
    connected: false,
    mapping: 'standard',
    timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    axes: [0, 0, 0, 0],
  };
  window.__pad = pad;
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => [pad.connected ? pad : null, null, null, null],
  });
})();`;

/** The standard mapping, by the buttons' Xbox (and Steam Deck) names. */
const BUTTON = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  view: 8,
  menu: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;
type Button = keyof typeof BUTTON;

const FRAMES = `(n) => new Promise((done) => {
  const next = () => (--n <= 0 ? done() : requestAnimationFrame(next));
  requestAnimationFrame(next);
})`;

async function plugIn(page: Page) {
  await page.evaluate(`window.__pad.connected = true; window.dispatchEvent(new Event('gamepadconnected'))`);
}

/** Presses a button for two frames and lets it go for two, as quick a press as a thumb makes. */
async function press(page: Page, b: Button) {
  await page.evaluate(`(async () => {
    const frames = ${FRAMES};
    const button = window.__pad.buttons[${BUTTON[b]}];
    button.pressed = true;
    button.value = 1;
    await frames(2);
    button.pressed = false;
    button.value = 0;
    await frames(2);
  })()`);
}

/** Tilts the right stick (down for positive) for some frames. */
async function tiltRight(page: Page, y: number, frames: number) {
  await page.evaluate(`(async () => {
    window.__pad.axes[3] = ${y};
    await (${FRAMES})(${frames});
    window.__pad.axes[3] = 0;
  })()`);
}

const focusedDest = (page: Page) =>
  page.evaluate<string | undefined>('document.activeElement?.getAttribute("data-dest") ?? undefined');

const hasFocus = (page: Page, selector: string) =>
  page.evaluate<boolean>(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`);

const scrollTop = (page: Page, selector: string) =>
  page.evaluate<number>(`document.querySelector(${JSON.stringify(selector)}).scrollTop`);

async function openDaily(page: Page) {
  await page.clock.setFixedTime(DATE);
  await page.addInitScript(FAKE_PAD);
  await page.goto('./');
  await expect(page.getByTestId('play-daily')).toBeEnabled();
}

async function beginDaily(page: Page) {
  await openDaily(page);
  await page.getByTestId('play-daily').click();
  await page.getByTestId('begin').click();
  await expect(page.getByTestId('soul-count')).toHaveText(`Soul 1 of ${state.cases.length}`);
  await plugIn(page);
}

test.describe('on a Steam Deck', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.skip(({ isMobile }) => isMobile, "the Deck's screen is set here; one run is enough");

  test('the whole Daily is played with the controller alone', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openDaily(page);
    await plugIn(page);

    // Nothing has the focus yet: the first press shows it, on the main button.
    await press(page, 'a');
    await expect(page.getByTestId('play-daily')).toBeFocused();
    await expect(page.locator('html')).toHaveAttribute('data-input', 'gamepad');
    // The title's line of keys gives way to the controller's.
    await expect(page.getByTestId('pad-keys')).toContainText('A choose · B back');
    await expect(page.locator('.title__keys')).toBeHidden();
    await press(page, 'a');
    await expect(page.getByTestId('begin')).toBeFocused();
    await press(page, 'a');
    await expect(page.locator('.shift--desk')).toBeVisible();

    for (const [i, c] of state.cases.entries()) {
      await expect(page.getByTestId('soul-count')).toHaveText(`Soul ${i + 1} of ${state.cases.length}`);
      // RT goes to the stamps; the d-pad along them; A stamps, and Send is next.
      await press(page, 'rt');
      await expect(page.locator('[data-dest]:focus')).toHaveCount(1);
      for (let k = 0; k < stamps.length && (await focusedDest(page)) !== c.expect.dest; k++) await press(page, 'right');
      await expect(page.locator(`[data-dest="${c.expect.dest}"]`)).toBeFocused();
      await press(page, 'a');
      await expect(page.locator(`[data-dest="${c.expect.dest}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('send')).toBeFocused();
      await press(page, 'a');
    }
    await expect(page.getByTestId('score')).toHaveText(`${state.cases.length} of ${state.cases.length} judged rightly`);
    // B from the summary goes home.
    await press(page, 'b');
    await expect(page.getByTestId('daily-result')).toContainText(`${state.cases.length}/${state.cases.length}`);
    expect(errors).toEqual([]);
  });

  test('the right of the last stamp is Send, or nothing: never the pause button across the screen', async ({
    page,
  }) => {
    await beginDaily(page);
    await press(page, 'rt');
    const last = stamps[stamps.length - 1];
    for (let k = 0; k < stamps.length + 2; k++) await press(page, 'right');
    // Send waits for a stamp, so the focus stays on the last one.
    await expect(page.locator(`[data-dest="${last}"]`)).toBeFocused();
    await press(page, 'a');
    await press(page, 'right');
    await expect(page.getByTestId('send')).toBeFocused();
  });

  test("the desk's buttons: compare, turn over, hint, pause", async ({ page }) => {
    await beginDaily(page);

    // X compares and B stops comparing.
    await press(page, 'x');
    await expect(page.getByTestId('compare')).toHaveAttribute('aria-pressed', 'true');
    await press(page, 'b');
    await expect(page.getByTestId('compare')).toHaveAttribute('aria-pressed', 'false');

    // Y turns the soul over.
    await expect(page.getByTestId('flip')).toContainText('Turn over');
    await press(page, 'y');
    await expect(page.getByTestId('flip')).toContainText('Turn face up');

    // LT asks Skögul.
    await press(page, 'lt');
    await expect(page.locator('.toast')).toHaveText(/^Skögul /);

    // Menu pauses and resumes; B resumes too.
    await press(page, 'menu');
    await expect(page.getByTestId('resume')).toBeFocused();
    await press(page, 'menu');
    await expect(page.getByTestId('resume')).toHaveCount(0);
    await press(page, 'b');
    await expect(page.getByTestId('resume')).toBeFocused();
    // While paused, the desk's buttons wait.
    await press(page, 'x');
    await expect(page.getByTestId('compare')).toHaveAttribute('aria-pressed', 'false');
    await press(page, 'b');
    await expect(page.getByTestId('resume')).toHaveCount(0);
  });

  test('LB and RB go from paper to paper; View and the sticks read the rules', async ({ page }) => {
    await beginDaily(page);
    const rules = page.locator('.paper--rules');

    await press(page, 'view');
    await expect(rules).toBeFocused();
    // The rules paper has nothing to press: the d-pad and the right stick scroll it.
    expect(await scrollTop(page, '.paper--rules')).toBe(0);
    await press(page, 'down');
    await expect(rules).toBeFocused();
    const nudged = await scrollTop(page, '.paper--rules');
    expect(nudged).toBeGreaterThan(0);
    await tiltRight(page, 1, 10);
    expect(await scrollTop(page, '.paper--rules')).toBeGreaterThan(nudged);

    // RB: the body and its signs, then each of the soul's papers, then the stamps, and round to the rules.
    await press(page, 'rb');
    await expect(page.locator('.desk__center :focus')).toHaveCount(1);
    await press(page, 'rb');
    await expect(page.locator('.paper--words :focus')).toHaveCount(1);
    await press(page, 'rb');
    await expect(page.locator('.paper--ravens :focus, .paper--ravens:focus')).toHaveCount(1);
    await press(page, 'rb');
    await expect(page.locator('.desk__bottom :focus')).toHaveCount(1);
    await press(page, 'rb');
    await expect(rules).toBeFocused();
    await press(page, 'lb');
    await expect(page.locator('.desk__bottom :focus')).toHaveCount(1);
  });

  test("the controller's prompts show while it's in use, and the keys again after a tap or a key", async ({ page }) => {
    await beginDaily(page);
    const compare = page.getByTestId('compare');
    const prompt = () =>
      page.evaluate<string>(`getComputedStyle(document.querySelector('[data-testid="compare"]'), '::after').content`);
    await expect(compare.locator('kbd')).toBeVisible();
    expect(await prompt()).toBe('none');

    await press(page, 'down');
    await expect(page.locator('html')).toHaveAttribute('data-input', 'gamepad');
    await expect(compare.locator('kbd')).toBeHidden();
    expect(await prompt()).toContain('"X"');
    await expect(page.locator('.desk__bottom .pad-legend')).toBeVisible();
    // A prompt isn't part of the button's name.
    await expect(compare).toHaveAccessibleName('Compare');

    await page.mouse.click(640, 790);
    await expect(page.locator('html')).not.toHaveAttribute('data-input', 'gamepad');
    await expect(compare.locator('kbd')).toBeVisible();

    await press(page, 'up');
    await expect(page.locator('html')).toHaveAttribute('data-input', 'gamepad');
    await page.keyboard.press('Shift');
    await expect(page.locator('html')).not.toHaveAttribute('data-input', 'gamepad');
  });
});

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'the drawer is the phone layout');

  test('LB and RB turn the tabs; RT brings up the stamps, and B puts them away', async ({ page }) => {
    await beginDaily(page);
    const selected = page.locator('[role="tab"][aria-selected="true"]');
    await expect(selected).toHaveAttribute('data-tab', 'words');
    await press(page, 'rb');
    await expect(selected).toHaveAttribute('data-tab', 'ravens');
    await expect(page.locator('#drawer-panel :focus, #drawer-panel:focus')).toHaveCount(1);
    await press(page, 'lb');
    await press(page, 'lb');
    // Round to the last tab, the rules: nothing in it to press, so the tab itself takes the focus.
    await expect(selected).toHaveAttribute('data-tab', 'rules');
    await expect(page.locator('#drawer-panel')).toBeFocused();

    await press(page, 'rt');
    const sheet = page.locator('.sheet');
    await expect(sheet).toBeVisible();
    await expect(page.locator(`.sheet [data-dest="${stamps[0]}"]`)).toBeFocused();
    // The d-pad stays in the sheet while it's up.
    for (const d of ['down', 'down', 'down', 'up', 'up', 'up', 'up', 'up'] as const) {
      await press(page, d);
      await expect(page.locator('.sheet :focus')).toHaveCount(1);
    }
    await press(page, 'b');
    await expect(sheet).toHaveCount(0);

    // A stamps and sends from the sheet; with a controller, Send doesn't ask to be held.
    await press(page, 'rt');
    await press(page, 'a');
    await expect(page.getByTestId('send')).toBeFocused();
    await expect(page.getByTestId('send')).not.toContainText('Hold');
    await press(page, 'a');
    await expect(page.getByTestId('soul-count')).toHaveText(`Soul 2 of ${state.cases.length}`);
  });

  test('the right stick scrolls the page', async ({ page }) => {
    await openDaily(page);
    await plugIn(page);
    expect(await page.evaluate<number>('scrollY')).toBe(0);
    await tiltRight(page, 1, 20);
    expect(await page.evaluate<number>('scrollY')).toBeGreaterThan(100);
  });
});

test('A picks up a slider, the d-pad moves it, A puts it down and B puts it back', async ({ page }) => {
  await openDaily(page);
  await plugIn(page);
  const settings = page.locator('.card--settings');
  const size = settings.locator('input[type="range"]').first();
  await settings.locator('summary').focus();
  await press(page, 'a');
  await expect(settings).toHaveAttribute('open', '');

  await size.focus();
  await expect(size).toHaveValue('1');
  await press(page, 'a');
  await press(page, 'right');
  await press(page, 'right');
  await expect(size).toHaveValue('1.1');
  await press(page, 'a');
  // Put down, the d-pad moves the focus again.
  await press(page, 'up');
  await expect(size).not.toBeFocused();
  await expect(size).toHaveValue('1.1');

  await size.focus();
  await press(page, 'a');
  await press(page, 'left');
  await expect(size).toHaveValue('1.05');
  await press(page, 'b');
  await expect(size).toHaveValue('1.1');
  await expect
    .poll(() => page.evaluate<number>(`JSON.parse(localStorage.getItem('cots.settings')).textScale`))
    .toBe(1.1);

  // B again closes the settings, at their heading.
  await press(page, 'b');
  await expect(settings).not.toHaveAttribute('open', '');
  await expect(settings.locator('summary')).toBeFocused();
});

test.describe('the campaign', () => {
  test.use({ baseURL: FULL });

  test('the d-pad and A start a run and choose in a scene; B leaves the slots', async ({ page }) => {
    await page.addInitScript(FAKE_PAD);
    await page.goto('./');
    await page.getByTestId('play-campaign').click();
    await expect(page.getByTestId('campaign-title')).toBeFocused();
    await plugIn(page);

    // B goes back to the title, and A comes back.
    await press(page, 'b');
    await expect(page.getByTestId('play-campaign')).toBeVisible();
    await page.getByTestId('play-campaign').focus();
    await press(page, 'a');
    await expect(page.getByTestId('campaign-title')).toBeFocused();

    for (let k = 0; k < 8 && !(await hasFocus(page, '[data-testid="new-0"]')); k++) await press(page, 'down');
    await expect(page.getByTestId('new-0')).toBeFocused();
    await press(page, 'a');
    await expect(page.getByTestId('morning-title')).toHaveText('Day 1');

    // The scene puts the focus on its first choice, and on the next as each is made: A plays it to its end.
    const scene = page.getByTestId('scene');
    await expect(scene).toBeVisible();
    for (let k = 0; k < 30 && (await scene.count()) > 0; k++) {
      await expect(page.locator('[data-testid="scene"] :focus')).toHaveCount(1);
      await press(page, 'a');
    }
    await expect(scene).toHaveCount(0);
  });
});
