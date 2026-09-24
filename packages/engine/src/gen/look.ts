import type { DayCtx } from '../logic/context';
import type { Truth } from '../logic/pred';
import { Rng } from '../rng/rng';
import type { Look } from './types';

const BUILDS = ['lean', 'broad', 'heavy'] as const;
const BEARDS = ['none', 'short', 'long', 'braided'] as const;
type Shape = Pick<Look, 'build' | 'beard'>;

/** Every build and beard a man or a woman can have (hair is a sign, not chosen here). */
const SHAPES: Readonly<Record<Look['gender'], readonly Shape[]>> = {
  m: BUILDS.flatMap((build) => BEARDS.map((beard) => ({ build, beard }))),
  f: BUILDS.map((build) => ({ build, beard: 'none' as const })),
};

/**
 * Names the story's own people have (the family, story souls), from every pool whose id starts with
 * `names.reserved`: no generated soul is given one, nor a father of that name.
 */
function reservedNames(pools: Readonly<Record<string, readonly string[]>>): ReadonlySet<string> {
  return new Set(
    Object.entries(pools)
      .filter(([id]) => id.startsWith('names.reserved'))
      .flatMap(([, names]) => names),
  );
}

const lookRng = (gen: number, runSeed: string, day: number, procIndex: number) =>
  new Rng(`${gen}|${runSeed}|${day}|${procIndex}|look`);

/**
 * Cosmetic identity and appearance. It may read the truth (old souls look
 * old) but nothing reads it back, so it can never change a judgment.
 * Names come from a per-day shuffle, so they are unique within a day and
 * depend only on (seed, day, index). On days that spread their looks
 * (knobs.spreadLooks: never the Daily), build, beard and clothing do too: a
 * soul takes the next of a per-day shuffle of every combination for its
 * gender, so no two souls of a day look alike at a glance until the
 * combinations run out.
 */
export function makeLook(truth: Truth, ctx: DayCtx, runSeed: string, procIndex: number, lookSeed?: string): Look {
  const gen = ctx.content.genVersion;
  const rng = lookSeed ? new Rng(lookSeed) : lookRng(gen, runSeed, ctx.day, procIndex);
  const gender = rng.chance(1, 4) ? 'f' : 'm';

  const names = new Rng(`${gen}|${runSeed}|${ctx.day}|names`);
  // On days that spread their looks, a soul's place among the day's souls of its gender (each gender a
  // function of its index) picks its name and its look; otherwise its place in the queue picks its name.
  const spread = ctx.spec.queue.knobs.spreadLooks === true;
  let rank = 0;
  if (spread) {
    for (let j = 0; j < procIndex; j++) {
      if ((lookRng(gen, runSeed, ctx.day, j).chance(1, 4) ? 'f' : 'm') === gender) rank++;
    }
  }
  const at = spread ? rank : procIndex;
  const reserved = reservedNames(ctx.content.pools);
  const pool = (id: string): readonly string[] => {
    const all = ctx.content.pools[id] ?? ['Nameless'];
    const free = all.filter((n) => !reserved.has(n));
    return free.length > 0 ? free : all;
  };
  const given = names.fork(gender).shuffle(pool(gender === 'f' ? 'names.f' : 'names.m'));
  const fathers = names.fork('fathers').shuffle(pool('names.m'));
  const name = given[at % given.length] ?? 'Nameless';
  const father = fathers[(procIndex + 7) % fathers.length] ?? 'Nobody';
  const patronym = `${father}${gender === 'f' ? 'sdottir' : 'sson'}`;

  const cause = truth.cause;
  const age = cause === 'oldAge' ? rng.int(64, 85) : cause === 'sickness' ? rng.int(24, 75) : rng.int(18, 58);
  if (spread) {
    // Every build and beard in a shuffled order first, then round again in other clothes: no two souls of
    // a gender share build, beard and clothing until all of them have been worn.
    const shapes = names.fork(`looks|${gender}`).shuffle(SHAPES[gender]);
    const tunics = names.fork(`tunics|${gender}`).shuffle([0, 1, 2, 3]);
    const shape = shapes[rank % shapes.length] ?? { build: 'broad', beard: 'none' };
    const tunic = tunics[((rank % shapes.length) + Math.floor(rank / shapes.length)) % tunics.length] ?? 0;
    return { gender, name, patronym, age, ...shape, tunic };
  }
  return {
    gender,
    name,
    patronym,
    age,
    build: rng.pick(BUILDS),
    beard: gender === 'f' ? 'none' : rng.pick(BEARDS),
  };
}
