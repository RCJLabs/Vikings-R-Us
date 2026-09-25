import { describe, expect, it } from 'vitest';
import { type Box, nearest } from './spatial';

const box = (left: number, top: number, width = 40, height = 20): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe('moving the focus a way', () => {
  // A row of three, a row of two below it (the first a little to the right), and one far off to the right.
  const row = [box(0, 0), box(50, 0), box(100, 0)];
  const below = [box(10, 40), box(60, 40)];
  const far = box(400, 0);
  const all = [...row, ...below, far];

  it('goes to the next along a row, not one further on', () => {
    expect(nearest(row[0] as Box, all, 'right')).toBe(1);
    expect(nearest(row[2] as Box, all, 'left')).toBe(1);
    expect(nearest(row[2] as Box, all, 'right')).toBe(5);
  });

  it('goes down to what lies under it rather than off to one side', () => {
    expect(nearest(row[0] as Box, all, 'down')).toBe(3);
    expect(nearest(row[1] as Box, all, 'down')).toBe(4);
    expect(nearest(row[2] as Box, all, 'down')).toBe(4);
    expect(nearest(below[0] as Box, all, 'up')).toBe(0);
  });

  it('stays put when nothing lies that way', () => {
    expect(nearest(row[0] as Box, all, 'up')).toBe(-1);
    expect(nearest(row[0] as Box, all, 'left')).toBe(-1);
    expect(nearest(below[1] as Box, all, 'down')).toBe(-1);
  });

  it('counts a neighbour that overlaps a little as that way, but not one level with it', () => {
    const wrapped = [box(0, 0, 40, 30), box(0, 27)];
    expect(nearest(wrapped[0] as Box, wrapped, 'down')).toBe(1);
    const level = [box(0, 0), box(50, 2)];
    expect(nearest(level[0] as Box, level, 'down')).toBe(-1);
  });

  it('leaves nothing for a box far off to one side of the way', () => {
    const stamp = box(0, 400);
    const pause = box(300, 0);
    expect(nearest(stamp, [pause], 'right')).toBe(-1);
    expect(nearest(stamp, [pause], 'up')).toBe(0);
  });

  it('prefers a near box a little off the line to a far one right on it', () => {
    const boxes = [box(0, 100), box(30, 30)];
    expect(nearest(box(0, 0), boxes, 'down')).toBe(1);
  });
});
