import { describe, expect, it } from 'vitest';
import { edges, type Held, NOTHING_HELD, type PadLike, REPEAT_EVERY, REPEAT_FIRST, readPads } from './pad';

/** A standard pad with these buttons held (by index), these button values, and these axes. */
function pad(
  held: readonly number[] = [],
  axes: readonly number[] = [0, 0, 0, 0],
  values: Record<number, number> = {},
) {
  return {
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: held.includes(i),
      value: values[i] ?? (held.includes(i) ? 1 : 0),
    })),
    axes,
  } satisfies PadLike;
}

describe('reading the pads', () => {
  it('names the buttons by the standard mapping', () => {
    expect([...readPads([pad([0, 3, 9])]).buttons]).toEqual(['a', 'y', 'menu']);
  });

  it('counts a trigger from halfway down, not at the lightest touch', () => {
    expect(readPads([pad([7], undefined, { 7: 0.3 })]).buttons.has('rt')).toBe(false);
    expect(readPads([pad([], undefined, { 6: 0.8 })]).buttons.has('lt')).toBe(true);
  });

  it('takes the d-pad, else the left stick past its dead zone, by its stronger axis', () => {
    expect(readPads([pad([15])]).dir).toBe('right');
    expect(readPads([pad([], [0.3, -0.4, 0, 0])]).dir).toBeNull();
    expect(readPads([pad([], [0.6, -0.9, 0, 0])]).dir).toBe('up');
    expect(readPads([pad([], [-0.7, 0.2, 0, 0])]).dir).toBe('left');
  });

  it('scrolls by the right stick, only past its dead zone', () => {
    expect(readPads([pad([], [0, 0, 0, 0.2])]).scroll).toBe(0);
    expect(readPads([pad([], [0, 0, 0, -0.8])]).scroll).toBe(-0.8);
  });

  it('merges every pad, and skips the empty slots', () => {
    const frame = readPads([null, pad([0]), pad([1], [0, 0, 0, 0.5])]);
    expect([...frame.buttons]).toEqual(['a', 'b']);
    expect(frame.scroll).toBe(0.5);
    expect(readPads([null, null]).buttons.size).toBe(0);
  });
});

describe('what a frame does', () => {
  const frame = (buttons: string[], dir: Held['dir'] = null) =>
    ({ buttons: new Set(buttons), dir, scroll: 0 }) as Parameters<typeof edges>[1];

  it('presses a button once, however long it is held', () => {
    const one = edges(NOTHING_HELD, frame(['a']), 0);
    expect(one.pressed).toEqual(['a']);
    const two = edges(one.held, frame(['a', 'x']), 16);
    expect(two.pressed).toEqual(['x']);
    expect(edges(two.held, frame(['a', 'x']), 32).pressed).toEqual([]);
  });

  it('moves at once, again after a pause, then steadily while a direction is held', () => {
    let held = NOTHING_HELD;
    const moves: number[] = [];
    for (let t = 0; t <= 800; t += 10) {
      const e = edges(held, frame([], 'down'), t);
      held = e.held;
      if (e.move) moves.push(t);
    }
    expect(moves.slice(0, 3)).toEqual([0, REPEAT_FIRST, REPEAT_FIRST + REPEAT_EVERY]);
  });

  it('moves at once when the direction changes, and not at all once let go', () => {
    const down = edges(NOTHING_HELD, frame([], 'down'), 0);
    const right = edges(down.held, frame([], 'right'), 50);
    expect(right.move).toBe('right');
    const off = edges(right.held, frame([]), 900);
    expect(off.move).toBeNull();
    expect(edges(off.held, frame([], 'right'), 910).move).toBe('right');
  });
});
