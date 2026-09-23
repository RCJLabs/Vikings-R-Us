import type { DayCtx } from '../logic/context';
import type { Truth } from '../logic/pred';
import { Rng } from '../rng/rng';
import type { Look } from './types';

const BUILDS = ['lean', 'broad', 'heavy'] as const;
const BEARDS = ['none', 'short', 'long', 'braided'] as const;

/**
 * Cosmetic identity and appearance. It may read the truth (old souls look
 * old) but nothing reads it back, so it can never change a judgment.
 * Names come from a per-day shuffle, so they are unique within a day and
 * depend only on (seed, day, index).
 */
export function makeLook(truth: Truth, ctx: DayCtx, runSeed: string, procIndex: number, lookSeed?: string): Look {
  const gen = ctx.content.genVersion;
  const rng = new Rng(lookSeed ?? `${gen}|${runSeed}|${ctx.day}|${procIndex}|look`);
  const gender = rng.chance(1, 4) ? 'f' : 'm';

  const names = new Rng(`${gen}|${runSeed}|${ctx.day}|names`);
  const pool = (id: string): readonly string[] => ctx.content.pools[id] ?? ['Nameless'];
  const given = names.fork(gender).shuffle(pool(gender === 'f' ? 'names.f' : 'names.m'));
  const fathers = names.fork('fathers').shuffle(pool('names.m'));
  const name = given[procIndex % given.length] ?? 'Nameless';
  const father = fathers[(procIndex + 7) % fathers.length] ?? 'Nobody';
  const patronym = `${father}${gender === 'f' ? 'sdottir' : 'sson'}`;

  const cause = truth.cause;
  const age = cause === 'oldAge' ? rng.int(64, 85) : cause === 'sickness' ? rng.int(24, 75) : rng.int(18, 58);
  return {
    gender,
    name,
    patronym,
    age,
    build: rng.pick(BUILDS),
    beard: gender === 'f' ? 'none' : rng.pick(BEARDS),
  };
}
