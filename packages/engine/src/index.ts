export {
  type CivilDate,
  DAILY_EPOCH,
  dailyNumber,
  dailySeed,
  daysFromCivil,
  isValidCivilDate,
} from './calendar';
export { fnv1a32, hashParts } from './rng/hash';
export { Rng } from './rng/rng';

/** Bump when a change breaks saves or replays (docs/tech-spec.md §7). */
export const ENGINE_MAJOR = 0;
