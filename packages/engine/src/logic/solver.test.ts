import { loadContent } from '@cots/testkit';
import { describe, expect, it } from 'vitest';
import type { Value } from '../content/types';
import type { Field } from '../gen/types';
import { createDayContext } from './context';
import { isPerceivable, solve } from './solver';

const content = loadContent('dev-full');
const ctxFor = (day: number) => createDayContext(content, day, 'solver-test');

const obs = (key: string, value: Value, extra: Partial<Field> = {}): Field => ({
  id: `body.${extra.view ?? 'front'}.${key}`,
  item: 'body',
  view: 'front',
  salience: 3,
  cost: 1,
  obs: { key, value },
  ...extra,
});
const back = (value: number): Field => obs('woundsBack', value, { view: 'back', id: 'body.back.woundsBack' });
const feather = (value: string): Field => obs('breath', value, { tool: 'feather', id: 'tool.feather.breath', cost: 0 });
const says = (item: Field['item'], id: string, fact: string, value: Value): Field => ({
  id,
  item,
  salience: 3,
  cost: 2,
  says: { fact, value },
});
const dest = (r: ReturnType<typeof solve>) => (r.judgment.kind === 'determined' ? r.judgment.dest : 'UNDETERMINED');

describe('solver', () => {
  it('day 1: no front wounds and no back wounds yet means no battle death', () => {
    const r = solve([obs('grip', 'weapon'), obs('woundsFront', 0), obs('skin', 'normal')], ctxFor(1));
    expect(dest(r)).toBe('HEL');
    expect(r.beliefs.get('cause')?.values).toEqual(['sickness', 'oldAge']);
  });

  it('day 1: fresh wounds and a weapon in hand mean Valhalla', () => {
    expect(dest(solve([obs('grip', 'weapon'), obs('woundsFront', 2)], ctxFor(1)))).toBe('VALHALLA');
  });

  it('day 2: without flipping the body, fleeing cannot be ruled out', () => {
    const r = solve([obs('grip', 'weapon'), obs('woundsFront', 2)], ctxFor(2));
    expect(r.judgment.kind).toBe('undetermined');
    if (r.judgment.kind === 'undetermined') expect(r.judgment.blocking).toContain('fled');
  });

  it('day 2: a back wound contradicts "I never turned my back"', () => {
    const r = solve(
      [obs('grip', 'weapon'), obs('woundsFront', 1), back(1), says('testimony', 'testimony.0', 'fled', false)],
      ctxFor(2),
    );
    expect(dest(r)).toBe('HEL');
    expect(r.contradictions).toEqual([{ lie: 'testimony.0', fact: 'fled', against: ['body.back.woundsBack'] }]);
  });

  it('day 3: the fallen are presumed dead until the feather stirs', () => {
    const base = [obs('grip', 'weapon'), obs('woundsFront', 1), back(0)];
    expect(dest(solve(base, ctxFor(3)))).toBe('VALHALLA');
    expect(dest(solve([...base, feather('stirs')], ctxFor(3)))).toBe('RETURN');
    expect(solve(base, ctxFor(3)).beliefs.get('alive')).toMatchObject({ values: [false], level: 1 });
  });

  it('trusts the ravens but not the dead', () => {
    const fields = [obs('grip', 'weapon'), obs('woundsFront', 1), says('huginn', 'huginn.0', 'fled', true)];
    expect(dest(solve(fields, ctxFor(2)))).toBe('HEL');
    const lying = [
      obs('grip', 'weapon'),
      obs('woundsFront', 0),
      back(0),
      says('testimony', 'testimony.0', 'cause', 'battle'),
    ];
    expect(dest(solve(lying, ctxFor(2)))).toBe('HEL');
    expect(dest(solve(lying, ctxFor(2), { trustTestimony: true }))).toBe('VALHALLA');
  });

  it('a confession narrows what the body could only partly show', () => {
    const fields = [obs('woundsFront', 0), back(0), says('testimony', 'testimony.0', 'cause', 'battle')];
    const r = solve(fields, ctxFor(2), { reveals: new Map([['testimony.0', { fact: 'cause', value: 'oldAge' }]]) });
    expect(r.beliefs.get('cause')).toMatchObject({ values: ['oldAge'], level: 4 });
  });

  it('reports conflicting evidence instead of guessing', () => {
    const r = solve([obs('grip', 'weapon'), obs('grip', 'none', { id: 'body.front.grip2' })], ctxFor(1));
    expect(r.conflicts.map((c) => c.fact)).toEqual(['grip']);
  });

  it('cannot see the back before the flip exists', () => {
    expect(isPerceivable(back(1), ctxFor(1))).toBe(false);
    expect(isPerceivable(back(1), ctxFor(2))).toBe(true);
    expect(isPerceivable(feather('still'), ctxFor(2))).toBe(false);
  });
});
