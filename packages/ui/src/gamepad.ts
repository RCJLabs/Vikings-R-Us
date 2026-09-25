import { effect, signal } from '@preact/signals';
import { unlockAudio } from './audio';
import { type Button, edges, type Held, NOTHING_HELD, readPads, STICK_SCROLL } from './pad';
import { type Box, type Dir, nearest } from './spatial';
import { screen } from './store';

/*
 * Playing with a controller (docs/tech-spec.md §36). The standard gamepad does what the keyboard does: X, Y,
 * LT, View and Menu send the shift's keys (shift/keys.ts); the d-pad and left stick move the focus to the
 * nearest control that way (spatial.ts); A presses what has the focus and B goes back; RT goes to the stamps,
 * LB and RB to the next paper; the right stick scrolls. While a controller is in use the page says so
 * (`data-input="gamepad"` on the root), which shows its button prompts in place of the keys; a key pressed or
 * a tap puts the keys back.
 */

/** Whether a controller is what's being played with. */
export const padInUse = signal(false);

/** What the focus can stop at. */
const CONTROL = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex]';
/** What keeps the focus inside while it's open: a dialog, or the stamp sheet. */
const LAYER = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';
/** A layer the desk's own buttons wait behind. */
const MODAL = '[role="alertdialog"], [aria-modal="true"]';
/** Fields a controller can't type into; the focus passes over them. */
const TYPED = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);
/** How far the right stick scrolls in a frame, tilted all the way (px). */
const SCROLL_SPEED = 20;
/** How much of a scrolling box one press of the d-pad scrolls, when there's nothing further that way. */
const NUDGE = 0.4;

const toBox = (r: DOMRect): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

/** Laid out and not hidden: inside no closed `<details>`, no `display: none`, no `visibility: hidden`. */
function shown(el: Element): boolean {
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true });
  }
  return el.getClientRects().length > 0;
}

function usable(el: HTMLElement): boolean {
  return (
    el.tabIndex >= 0 && !el.matches(':disabled') && el.closest('[inert], [aria-hidden="true"]') === null && shown(el)
  );
}

/**
 * The controls in `root` the focus can stop at. One that holds others (a scrolling panel of lines) is a stop
 * only when there's nothing in it to stop at.
 */
function candidates(root: ParentNode): HTMLElement[] {
  const all = [...root.querySelectorAll<HTMLElement>(CONTROL)].filter(usable);
  return all.filter((el) => !all.some((other) => other !== el && el.contains(other)));
}

/** The dialog on top, if one is open, else the page. */
function layer(): HTMLElement {
  return [...document.querySelectorAll<HTMLElement>(LAYER)].filter(shown).at(-1) ?? document.body;
}

/** What has the focus in `root`, if anything there does. */
function focused(root: HTMLElement): HTMLElement | null {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || el === document.body || !root.contains(el)) return null;
  return shown(el) && el.closest('[inert]') === null ? el : null;
}

/** Where a control shows: its box, cut down by the scrolling boxes it's in (not those `from` shares with it). */
function visibleBox(el: Element, from: Element): Box | null {
  let b = toBox(el.getBoundingClientRect());
  for (let p = el.parentElement; p && !p.contains(from); p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
    const r = p.getBoundingClientRect();
    b = {
      left: Math.max(b.left, r.left),
      top: Math.max(b.top, r.top),
      right: Math.min(b.right, r.right),
      bottom: Math.min(b.bottom, r.bottom),
    };
    if (b.right - b.left < 1 || b.bottom - b.top < 1) return null;
  }
  return b;
}

/** Scrolls up and down by itself, with more to show. */
function scrolls(el: Element): boolean {
  return /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1;
}

/** What the right stick scrolls: the scrolling box the focus is in, else the drawer's open tab, else the page. */
function scroller(from: Element | null): Element {
  for (let p = from; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    if (scrolls(p)) return p;
  }
  const panel = document.getElementById('drawer-panel');
  if (panel && scrolls(panel)) return panel;
  return document.scrollingElement ?? document.documentElement;
}

function nudge(el: Element, dir: Dir): void {
  if (dir !== 'up' && dir !== 'down') return;
  const view = el === document.scrollingElement ? window.innerHeight : el.clientHeight;
  el.scrollBy({ top: (dir === 'down' ? NUDGE : -NUDGE) * view, behavior: 'instant' });
}

/** Where the focus last was in each layer, to come back near it when what had it has gone. */
const spots = new WeakMap<Element, Box>();

function focusOn(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** After the page has drawn what a press changed. */
const afterRender = (f: () => void) => requestAnimationFrame(() => f());

/**
 * With nothing focused, the first press shows where the focus is: near where it last was (the question
 * asked, its button gone), else on the screen's main button.
 */
function wake(root: HTMLElement): void {
  const all = candidates(root);
  const spot = spots.get(root);
  if (spot && all.length > 0) {
    const mid = (b: Box) => [(b.left + b.right) / 2, (b.top + b.bottom) / 2] as const;
    const [x, y] = mid(spot);
    const far = (el: HTMLElement) => {
      const [ex, ey] = mid(toBox(el.getBoundingClientRect()));
      return (ex - x) ** 2 + (ey - y) ** 2;
    };
    focusOn(all.reduce((a, b) => (far(b) < far(a) ? b : a)));
    return;
  }
  focusOn(all.find((el) => el.matches('.btn--primary')) ?? all[0]);
}

function move(root: HTMLElement, dir: Dir): void {
  if (editing) {
    adjust(editing, dir);
    return;
  }
  const from = focused(root);
  if (!from) {
    wake(root);
    return;
  }
  // A focused scrolling paper scrolls before the focus leaves it.
  const more = dir === 'down' ? from.scrollTop + from.clientHeight < from.scrollHeight - 1 : from.scrollTop > 0;
  if ((dir === 'up' || dir === 'down') && more && scrolls(from)) {
    nudge(from, dir);
    return;
  }
  const all = candidates(root);
  const inside = all.filter((el) => el !== from && from.contains(el));
  if (inside.length > 0) {
    focusOn(dir === 'up' || dir === 'left' ? inside.at(-1) : inside[0]);
    return;
  }
  const others: HTMLElement[] = [];
  const boxes: Box[] = [];
  for (const el of all) {
    if (el === from || el.contains(from)) continue;
    const b = visibleBox(el, from);
    if (b) {
      others.push(el);
      boxes.push(b);
    }
  }
  const i = nearest(toBox(from.getBoundingClientRect()), boxes, dir);
  if (i >= 0) focusOn(others[i]);
  else nudge(scroller(from), dir);
}

// ---------- lists and sliders ----------

/** A list or slider A picked up: the d-pad changes it until A puts it down, or B puts it back as it was. */
let editing: { readonly el: HTMLSelectElement | HTMLInputElement; readonly was: string } | null = null;

function startEditing(el: HTMLSelectElement | HTMLInputElement): void {
  editing = { el, was: el.value };
  el.dataset.padEditing = '';
}

function stopEditing(undo: boolean): void {
  const e = editing;
  if (!e) return;
  editing = null;
  delete e.el.dataset.padEditing;
  if (undo && e.el.value !== e.was) setValue(e.el, e.was);
}

function setValue(el: HTMLSelectElement | HTMLInputElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function adjust(e: NonNullable<typeof editing>, dir: Dir): void {
  const { el } = e;
  if (!el.isConnected || document.activeElement !== el) {
    stopEditing(false);
    return;
  }
  if (el instanceof HTMLSelectElement) {
    // Down the list, or right, for the next.
    const step = dir === 'down' || dir === 'right' ? 1 : -1;
    let i = el.selectedIndex + step;
    while (el.options[i]?.disabled) i += step;
    const next = el.options[i];
    if (next) setValue(el, next.value);
    return;
  }
  const before = el.value;
  if (dir === 'right' || dir === 'up') el.stepUp();
  else el.stepDown();
  const after = el.value;
  if (after !== before) setValue(el, after);
}

// ---------- the buttons ----------

/** A: press what has the focus. A stamp chosen, Send is next, as with the number keys. */
function choose(root: HTMLElement): void {
  if (editing) {
    stopEditing(false);
    return;
  }
  const el = focused(root);
  if (!el) {
    wake(root);
    return;
  }
  if (el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === 'range')) {
    startEditing(el);
    return;
  }
  if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TYPED.has(el.type))) return;
  el.click();
  if (el.matches('[data-dest]')) {
    afterRender(() => focusOn(document.querySelector<HTMLElement>('[data-testid="send"]')));
  }
}

/**
 * B: the nearest way back from the focus. On the desk that's Esc (compare, then the stamp sheet, then
 * pause); elsewhere the innermost open section or back button around the focus: a confirmation's Cancel
 * before the screen's Back.
 */
function back(root: HTMLElement): void {
  if (editing) {
    stopEditing(true);
    return;
  }
  if (root === document.body && screen.peek() === 'shift') {
    sendKey('Escape');
    return;
  }
  for (let p: HTMLElement | null = focused(root) ?? root; p; p = p.parentElement) {
    if (p instanceof HTMLDetailsElement && p.open) {
      p.open = false;
      focusOn(p.querySelector<HTMLElement>(':scope > summary'));
      return;
    }
    const out = [...p.querySelectorAll<HTMLElement>('[data-back]')].filter(usable).at(-1);
    if (out) {
      out.click();
      return;
    }
    if (p === root) break;
  }
  if (root !== document.body) sendKey('Escape');
}

/** The shift's keys, sent where the keyboard's would go (shift/keys.ts reads them on the window). */
function sendKey(key: string): void {
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
}

/** RT: the stamps (on a phone, the judge sheet opened), at the one chosen. */
function toStamps(): void {
  const judge = document.querySelector<HTMLElement>('[data-testid="judge"]');
  if (judge && usable(judge)) judge.click();
  afterRender(() => {
    const stamps = [...document.querySelectorAll<HTMLElement>('[data-dest]')].filter(usable);
    focusOn(stamps.find((s) => s.getAttribute('aria-pressed') === 'true') ?? stamps[0]);
  });
}

/** Into a paper or tab: at its first control, or the paper itself when it has none (to scroll it). */
function enter(panel: HTMLElement | null | undefined): void {
  if (panel) focusOn(candidates(panel)[0] ?? panel);
}

/** LB and RB: the tab before or after on a phone; on the desk, the paper (or the body, or the stamps). */
function cycle(step: 1 | -1): void {
  const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].filter(usable);
  if (tabs.length > 0) {
    const at = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    tabs[(at + step + tabs.length) % tabs.length]?.click();
    afterRender(() => enter(document.querySelector<HTMLElement>('[role="tabpanel"]')));
    return;
  }
  const panels = [...document.querySelectorAll<HTMLElement>('[data-panel]')].filter(shown);
  if (panels.length === 0) return;
  const at = panels.findIndex((p) => p.contains(document.activeElement));
  const i = at < 0 ? (step > 0 ? 0 : panels.length - 1) : (at + step + panels.length) % panels.length;
  enter(panels[i]);
}

/** View: the rules, as R shows them, with the focus on them so the stick scrolls them. */
function toRules(): void {
  sendKey('r');
  afterRender(() => enter(document.querySelector<HTMLElement>('.paper--rules, #drawer-panel')));
}

function press(b: Button): void {
  const root = layer();
  if (b === 'a') {
    choose(root);
    return;
  }
  if (b === 'b') {
    back(root);
    return;
  }
  if (screen.peek() !== 'shift') return;
  const modal = root.matches(MODAL);
  // Menu pauses, and resumes; any other dialog waits to be closed.
  if (b === 'menu') {
    if (!modal || root.querySelector('[data-testid="resume"]')) sendKey('p');
    return;
  }
  if (modal) return;
  if (b === 'rt') {
    toStamps();
    return;
  }
  // The stamp sheet gives way to whatever else the desk is asked for.
  if (root !== document.body) root.querySelector<HTMLElement>('[data-back]')?.click();
  if (b === 'x') sendKey('c');
  else if (b === 'y') sendKey('f');
  else if (b === 'lt') sendKey('h');
  else if (b === 'view') toRules();
  else if (b === 'lb') cycle(-1);
  else if (b === 'rb') cycle(1);
}

function scrollBy(tilt: number): void {
  const px = Math.sign(tilt) * ((Math.abs(tilt) - STICK_SCROLL) / (1 - STICK_SCROLL)) * SCROLL_SPEED;
  scroller(document.activeElement).scrollBy({ top: px, behavior: 'instant' });
}

// ---------- the loop ----------

function setPad(on: boolean): void {
  if (padInUse.peek() === on) return;
  padInUse.value = on;
  if (on) document.documentElement.dataset.input = 'gamepad';
  else {
    delete document.documentElement.dataset.input;
    stopEditing(false);
  }
}

let held: Held = NOTHING_HELD;
let loop = 0;

function pads(): readonly (Gamepad | null)[] {
  try {
    return navigator.getGamepads().filter((p) => p?.connected);
  } catch {
    // A page embedded where gamepads aren't allowed.
    return [];
  }
}

/** Polled once a frame while a controller is connected; the browser only says when one comes or goes. */
function frame(t: number): void {
  loop = 0;
  const list = pads();
  if (list.length === 0) {
    held = NOTHING_HELD;
    return;
  }
  const now = readPads(list);
  const e = edges(held, now, t);
  held = e.held;
  if (e.pressed.length > 0 || e.move || now.scroll !== 0) {
    if (!padInUse.peek()) {
      setPad(true);
      // Sound, if the browser counts a press as the player's gesture; a web page may wait for a key or a tap
      // (docs/tech-spec.md §36).
      unlockAudio();
    }
    for (const b of e.pressed) press(b);
    if (e.move) move(layer(), e.move);
    if (now.scroll !== 0) scrollBy(now.scroll);
  }
  loop = requestAnimationFrame(frame);
}

function run(): void {
  if (loop === 0 && pads().length > 0) loop = requestAnimationFrame(frame);
}

/** Starts listening for controllers; returns what stops it. */
export function startGamepad(): () => void {
  if (typeof navigator.getGamepads !== 'function') return () => undefined;
  const keys = (e: KeyboardEvent) => {
    if (e.isTrusted) setPad(false);
  };
  const taps = (e: PointerEvent) => {
    if (e.isTrusted) setPad(false);
  };
  const remember = (e: FocusEvent) => {
    if (e.target instanceof HTMLElement) {
      spots.set(e.target.closest(LAYER) ?? document.body, toBox(e.target.getBoundingClientRect()));
    }
  };
  window.addEventListener('gamepadconnected', run);
  window.addEventListener('keydown', keys, true);
  window.addEventListener('pointerdown', taps, true);
  document.addEventListener('focusin', remember);
  // A new screen starts afresh: where the focus was on the last one means nothing here.
  const stopScreens = effect(() => {
    screen.value;
    spots.delete(document.body);
  });
  run();
  return () => {
    window.removeEventListener('gamepadconnected', run);
    window.removeEventListener('keydown', keys, true);
    window.removeEventListener('pointerdown', taps, true);
    document.removeEventListener('focusin', remember);
    stopScreens();
    cancelAnimationFrame(loop);
    loop = 0;
    held = NOTHING_HELD;
    setPad(false);
  };
}
