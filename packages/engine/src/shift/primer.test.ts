import { loadDailyContent } from '@cots/testkit';
import { describe, expect, it } from 'vitest';
import { solve } from '../logic/solver';
import { startShift, stepShift } from './shift';

const content = loadDailyContent();

describe('the primer', () => {
  const { state, ctx } = startShift(content, { mode: 'primer', seed: 'primer', day: 5, untimed: true });

  it('plays its scripted souls in order', () => {
    expect(state.cases.map((c) => [c.archetype, c.expect.dest])).toEqual([
      ['arch.honest_warrior', 'VALHALLA'],
      ['arch.fled_coward', 'HEL'],
      ['arch.not_quite_dead', 'RETURN'],
    ]);
    expect(state.cases.every((c) => !c.meta.fallback)).toBe(true);
  });

  it('has the teaching moments the coach points at', () => {
    const [warrior, coward, living] = state.cases;
    // 1: honest, decided by weapon in hand and front wounds.
    expect(warrior?.lies).toEqual([]);
    expect(warrior?.meta.proof).toEqual(expect.arrayContaining(['body.front.grip']));
    // 2: always lies about fleeing, and the wound in the back shows it once turned over.
    expect(coward?.lies.map((l) => [l.fact, l.claimed])).toEqual([['fled', false]]);
    const lie = coward?.lies[0]?.field ?? '';
    const found = solve(coward?.evidence.fields ?? [], ctx).contradictions.find((x) => x.lie === lie);
    expect(found?.against).toContain('body.back.woundsBack');
    // 3: alive, with the mist at the lips as a cue and the feather as proof.
    expect(living?.evidence.fields.map((f) => f.id)).toEqual(
      expect.arrayContaining(['cue.breathFog', 'tool.feather.breath']),
    );
    expect(living?.meta.proof).toContain('tool.feather.breath');
  });

  it('has no sun', () => {
    const begun = stepShift(state, { t: 'begin', at: 0 }, ctx).state;
    expect(stepShift(begun, { t: 'tick', at: 10_000_000 }, ctx).events).toEqual([]);
  });

  it('is the same for everyone', () => {
    const again = startShift(content, { mode: 'primer', seed: 'primer', day: 5, untimed: true }).state;
    expect(again.cases).toEqual(state.cases);
  });
});
