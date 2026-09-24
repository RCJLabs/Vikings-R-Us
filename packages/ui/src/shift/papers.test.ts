import { describe, expect, it } from 'vitest';
import { clampSpot, type DeskPapers, putDown, topZ } from './papers';

/* Papers on the desk layout (docs/tech-spec.md §33): they stay on the desk, and the pile keeps its order. */

describe('papers on the desk', () => {
  it('stay on the desk, whole across and with their title in reach', () => {
    expect(clampSpot({ x: -0.2, y: -1, w: 0.3, z: 1 })).toEqual({ x: 0, y: 0, w: 0.3, z: 1 });
    expect(clampSpot({ x: 0.9, y: 0.99, w: 0.3, z: 1 }, 0.05)).toEqual({ x: 0.7, y: 0.95, w: 0.3, z: 1 });
    // No paper is a sliver or wider than most of the desk.
    expect(clampSpot({ x: 0, y: 0, w: 0.01, z: 1 }).w).toBe(0.15);
    expect(clampSpot({ x: 0.5, y: 0, w: 2, z: 1 })).toMatchObject({ x: 0.4, w: 0.6 });
  });

  it('go on top of the pile when picked up, and the pile is renumbered when one is put down or back', () => {
    const none: DeskPapers = {};
    expect(topZ(none)).toBe(1);
    const one = putDown(none, 'words', { x: 0.1, y: 0.1, w: 0.3, z: topZ(none) });
    const two = putDown(one, 'rules', { x: 0.2, y: 0.2, w: 0.3, z: 7 });
    expect(two).toEqual({
      words: { x: 0.1, y: 0.1, w: 0.3, z: 1 },
      rules: { x: 0.2, y: 0.2, w: 0.3, z: 2 },
    });
    // Picking words up again puts it on top; putting rules back leaves words alone at 1.
    const again = putDown(two, 'words', { x: 0.5, y: 0.5, w: 0.3, z: topZ(two) });
    expect(again.words?.z).toBe(2);
    expect(again.rules?.z).toBe(1);
    expect(putDown(again, 'rules', null)).toEqual({ words: { x: 0.5, y: 0.5, w: 0.3, z: 1 } });
  });
});
