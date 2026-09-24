import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COACH_FOCUS, createDayContext, generateDay } from '@cots/engine';
import { loadContent } from '@cots/testkit';
import { describe, expect, it } from 'vitest';
import { hintTarget } from './hint';

/* Wherever Skögul points, she can say where and the desk can show it (docs/tech-spec.md §26). */

const full = loadContent('dev-full');
const packs = resolve(import.meta.dirname, '../../../../content/packs');
const core: Record<string, string> = JSON.parse(readFileSync(resolve(packs, 'core/strings/en.json'), 'utf8'));

describe('Skögul’s hint', () => {
  it('has a line and a highlight for every piece of deciding evidence, Days 1-20', () => {
    const targets = new Set<string>();
    for (const { day } of full.days) {
      for (let n = 0; n < 6; n++) {
        const seed = `hint-${n}`;
        for (const c of generateDay(seed, createDayContext(full, day, seed)).cases) {
          const state = { soul: { view: 'front' } } as Parameters<typeof hintTarget>[1];
          for (const id of c.meta.proof) {
            const f = c.evidence.fields.find((x) => x.id === id);
            if (!f) throw new Error(`proof field ${id} isn't in the soul's evidence`);
            const { text, focus } = hintTarget(f, state);
            expect(core[text], text).toBeDefined();
            for (const name of focus.split(' ')) expect(COACH_FOCUS).toContain(name);
            targets.add(text);
          }
        }
      }
    }
    // The body's regions, the tools that read evidence, and the papers all come up.
    expect([...targets].sort()).toEqual(
      expect.arrayContaining(['ui.hint.hands', 'ui.hint.back', 'ui.hint.registry', 'ui.hint.runeLens']),
    );
  });
});
