/**
 * Golden summaries of generated days. A diff here means generated cases (and
 * therefore Dailies) changed: if that was intended, bump `genVersion` in
 * content/packs/core/pack.yaml and run `pnpm golden:update`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDayContext, generateDay } from '@cots/engine';
import { loadContent } from '@cots/testkit';
import { expect, it } from 'vitest';

const FILE = resolve(import.meta.dirname, 'days-1-5.json');
const content = loadContent('dev-full');

function summarize() {
  const out: Record<string, unknown> = { genVersion: content.genVersion };
  for (let s = 0; s < 12; s++) {
    for (let day = 1; day <= 5; day++) {
      const seed = `golden-${s}`;
      const ctx = createDayContext(content, day, seed);
      out[`${seed}/day-${day}`] = {
        params: Object.fromEntries(Object.entries(ctx.paramChoices).map(([k, v]) => [k, v.id])),
        souls: generateDay(seed, ctx).cases.map((c) =>
          [
            c.evidence.look.name,
            c.archetype.replace('arch.', ''),
            c.expect.dest,
            c.lies.map((l) => `lie ${l.fact}=${String(l.claimed)}/${l.onQuestion}`).join(',') || 'honest',
            `proof ${c.meta.proof.join('+')} ${c.meta.proofCostS}s`,
            `difficulty ${c.meta.difficulty}`,
          ].join(' | '),
        ),
      };
    }
  }
  return out;
}

it('generated days match the golden summaries', () => {
  const actual = summarize();
  if (process.env.UPDATE_GOLDEN === '1' || !existsSync(FILE)) {
    writeFileSync(FILE, `${JSON.stringify(actual, null, 2)}\n`);
  }
  expect(actual).toEqual(JSON.parse(readFileSync(FILE, 'utf8')));
});
