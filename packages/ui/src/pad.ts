/*
 * Reading a controller (docs/tech-spec.md §36): what's held down on the standard gamepad each frame, and what
 * that frame newly pressed. Pure, so it's tested without a browser; gamepad.ts polls the pads and acts.
 */
import type { Dir } from './spatial';

/** The buttons the game uses, by their Xbox (and Steam Deck) names. */
export type Button = 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'lt' | 'rt' | 'view' | 'menu';

/** What a pad reports; the browser's Gamepad is one. */
export interface PadLike {
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
  readonly axes: readonly number[];
}

/** One frame of every pad together: the buttons held, the way the d-pad or left stick points, the right stick. */
export interface PadFrame {
  readonly buttons: ReadonlySet<Button>;
  readonly dir: Dir | null;
  /** The right stick's tilt up (negative) or down (positive), 0 inside its dead zone. */
  readonly scroll: number;
}

/** What was held last frame, and when a direction still held moves the focus again. */
export interface Held {
  readonly buttons: ReadonlySet<Button>;
  readonly dir: Dir | null;
  readonly next: number;
}

/** Where each button sits in the standard mapping (w3c.github.io/gamepad, "Remapping"). */
const BUTTONS: readonly (readonly [Button, number])[] = [
  ['a', 0],
  ['b', 1],
  ['x', 2],
  ['y', 3],
  ['lb', 4],
  ['rb', 5],
  ['lt', 6],
  ['rt', 7],
  ['view', 8],
  ['menu', 9],
];
const DPAD: readonly (readonly [Dir, number])[] = [
  ['up', 12],
  ['down', 13],
  ['left', 14],
  ['right', 15],
];

/** How far the left stick tilts before it moves the focus, and the right before it scrolls. */
export const STICK_MOVE = 0.5;
export const STICK_SCROLL = 0.25;
/** A direction held down moves once, again after this long, then at this pace (ms). */
export const REPEAT_FIRST = 400;
export const REPEAT_EVERY = 120;

export const NOTHING_HELD: Held = { buttons: new Set(), dir: null, next: 0 };

/** The way a stick points, if it's tilted far enough; its stronger axis wins. */
function stickDir(x: number, y: number): Dir | null {
  if (Math.max(Math.abs(x), Math.abs(y)) < STICK_MOVE) return null;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
  return y > 0 ? 'down' : 'up';
}

/**
 * Every pad at once: a button is held if it's held on any of them (a controller the system shows twice, raw
 * and through Steam, still presses once). The triggers count from halfway down, so resting a finger on one
 * does nothing.
 */
export function readPads(pads: readonly (PadLike | null)[]): PadFrame {
  const buttons = new Set<Button>();
  let dir: Dir | null = null;
  let scroll = 0;
  for (const pad of pads) {
    if (!pad) continue;
    const down = (i: number, analog: boolean): boolean => {
      const b = pad.buttons[i];
      return b !== undefined && (analog ? b.value > 0.5 : b.pressed);
    };
    for (const [name, i] of BUTTONS) if (down(i, name === 'lt' || name === 'rt')) buttons.add(name);
    dir ??= DPAD.find(([, i]) => down(i, false))?.[0] ?? stickDir(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    const tilt = pad.axes[3] ?? 0;
    if (Math.abs(tilt) >= STICK_SCROLL && Math.abs(tilt) > Math.abs(scroll)) scroll = tilt;
  }
  return { buttons, dir, scroll };
}

/**
 * What this frame does: the buttons pressed since the last one, in a fixed order, and a move of the focus
 * when a direction is newly pressed or has been held long enough to repeat.
 */
export function edges(
  prev: Held,
  now: PadFrame,
  t: number,
): { readonly held: Held; readonly pressed: readonly Button[]; readonly move: Dir | null } {
  const pressed = BUTTONS.map(([name]) => name).filter((b) => now.buttons.has(b) && !prev.buttons.has(b));
  let move: Dir | null = null;
  let next = prev.next;
  if (now.dir !== null && now.dir !== prev.dir) {
    move = now.dir;
    next = t + REPEAT_FIRST;
  } else if (now.dir !== null && t >= prev.next) {
    move = now.dir;
    next = t + REPEAT_EVERY;
  }
  return { held: { buttons: now.buttons, dir: now.dir, next }, pressed, move };
}
