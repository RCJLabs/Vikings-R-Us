/**
 * Checksums of Dailies #1-#180. Everyone playing Daily #n must get the same
 * souls, so a diff here is a player-facing break: if it was intended, bump
 * `genVersion` in content/packs/core/pack.yaml (the share text carries it)
 * and run `pnpm golden:update`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dailySeed, queueChecksum, startShift } from '@cots/engine';
import { loadContent, loadDailyContent } from '@cots/testkit';
import { expect, it } from 'vitest';

const FILE = resolve(import.meta.dirname, 'dailies.json');
const COUNT = 180;
const daily = loadDailyContent();

const checksum = (n: number, content = daily) => {
  const { state, ctx } = startShift(content, { mode: 'daily', seed: dailySeed(n), day: 5, dailyNumber: n });
  return queueChecksum(state.cases, ctx);
};

it('Dailies #1-#180 match their pinned checksums', () => {
  const actual: Record<string, unknown> = { genVersion: daily.genVersion };
  for (let n = 1; n <= COUNT; n++) actual[`#${n}`] = checksum(n);
  if (process.env.UPDATE_GOLDEN === '1' || !existsSync(FILE)) {
    writeFileSync(FILE, `${JSON.stringify(actual, null, 2)}\n`);
  }
  expect(actual).toEqual(JSON.parse(readFileSync(FILE, 'utf8')));
});

it('every build plays the same Daily', () => {
  // The game passes dailyContent (core + daily packs); this guards buildDaily itself.
  const again = loadDailyContent();
  for (const n of [1, 2, 97]) expect(checksum(n, again)).toBe(checksum(n));
  expect(loadContent('web-demo').daily).toEqual(daily.daily);
  expect(loadContent('electron-full').daily).toEqual(daily.daily);
});
