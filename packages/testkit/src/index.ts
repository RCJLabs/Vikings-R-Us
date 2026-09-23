import fc from 'fast-check';

export {
  JUDGING,
  type Judging,
  type NightStrategy,
  type PolicyReport,
  type RunResult,
  simulateCampaign,
  simulateRun,
} from './campaign-sim';
export { loadContent, loadDailyContent } from './content';
export { type OracleResult, oracleSolve } from './oracle';
export { checkThresholds, type SweepOptions, type SweepReport, sweep, THRESHOLDS } from './sweep';
export { fc };

/** A short non-empty seed string, the shape the engine's RNG takes. */
export const arbSeed = (): fc.Arbitrary<string> => fc.string({ minLength: 1, maxLength: 16 });
