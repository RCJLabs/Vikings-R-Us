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

const content = loadContent('dev-full');

/**
 * Days 1-5 play in the demo and feed the Daily's mechanics; Days 6 on are the
 * full game's (a diff there changes campaigns and practice, not Dailies).
 */
const FILES = [
  { file: resolve(import.meta.dirname, 'days-1-5.json'), days: [1, 2, 3, 4, 5] },
  {
    file: resolve(import.meta.dirname, 'days-6-on.json'),
    days: content.days.map((d) => d.day).filter((d) => d >= 6),
  },
];

function summarize(days: readonly number[]) {
  const out: Record<string, unknown> = { genVersion: content.genVersion };
  for (let s = 0; s < 12; s++) {
    for (const day of days) {
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
            ...(c.expect.procedures ? [`then ${c.expect.procedures.join('+')}`] : []),
          ].join(' | '),
        ),
      };
    }
  }
  return out;
}

// Generating 12 seeds of every day takes about 4 s alone, so the default 5 s runs out when the whole suite
// runs in parallel on a busy machine.
it.each(FILES.map((f) => [f.file.split('/').pop(), f] as const))(
  'generated days match %s',
  (_, { file, days }) => {
    const actual = summarize(days);
    if (process.env.UPDATE_GOLDEN === '1' || !existsSync(file)) {
      writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
    }
    expect(actual).toEqual(JSON.parse(readFileSync(file, 'utf8')));
  },
  30_000,
);
