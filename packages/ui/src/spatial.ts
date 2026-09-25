/*
 * Moving the focus with a controller's d-pad or stick (docs/tech-spec.md §36): to the nearest control that
 * way. The geometry, here, is pure; gamepad.ts finds the controls and moves the focus.
 */

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** How much two neighbours may overlap along the way and still count as that way (a wrapped row, a taller button). */
const SLACK = 4;

/**
 * The index of the box to move to from `from` going `dir`: of the boxes beyond it that way, and within 45° of
 * it (right from the last stamp isn't the pause button at the top of the screen), the nearest, where drifting
 * across the way counts twice as much as going along it, and the centres' offset breaks ties. -1 when there's
 * nothing that way.
 */
export function nearest(from: Box, boxes: readonly Box[], dir: Dir): number {
  const vertical = dir === 'up' || dir === 'down';
  let best = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  boxes.forEach((b, i) => {
    const ahead =
      dir === 'down'
        ? b.top - from.bottom
        : dir === 'up'
          ? from.top - b.bottom
          : dir === 'right'
            ? b.left - from.right
            : from.left - b.right;
    if (ahead < -SLACK) return;
    const [a0, a1, b0, b1] = vertical
      ? [from.left, from.right, b.left, b.right]
      : [from.top, from.bottom, b.top, b.bottom];
    // The gap across the way between the two spans (none when they overlap), and between their centres.
    const across = Math.max(0, b0 - a1, a0 - b1);
    if (across > Math.max(0, ahead) + SLACK) return;
    const offset = Math.abs((a0 + a1) / 2 - (b0 + b1) / 2);
    const score = Math.max(0, ahead) + 2 * across + offset / 10;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
