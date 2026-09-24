import { loadContent } from '@cots/testkit';
import { describe, expect, it } from 'vitest';
import { type RuleDef, ruleText } from './types';

describe('ruleText', () => {
  const rules = loadContent('dev-full').rules;
  const rule = (id: string): RuleDef => {
    const r = rules.find((x) => x.id === id);
    if (!r) throw new Error(`no ${id}`);
    return r;
  };

  it('words a rule as it stands on the day: its latest wording by then', () => {
    // Valhalla's rule asks that the soul never fled from Day 2, when turning the body over is taught.
    const valhalla = rule('rule.valhalla');
    expect([1, 2, 20].map((day) => ruleText(valhalla, day))).toEqual([
      'rule.valhalla',
      'rule.valhalla.fled',
      'rule.valhalla.fled',
    ]);
    const again: RuleDef = { ...valhalla, texts: [...(valhalla.texts ?? []), { since: 9, text: 'rule.valhalla.9' }] };
    expect([1, 8, 9, 20].map((day) => ruleText(again, day))).toEqual([
      'rule.valhalla',
      'rule.valhalla.fled',
      'rule.valhalla.9',
      'rule.valhalla.9',
    ]);
    expect(ruleText(rule('rule.hel'), 20)).toBe('rule.hel');
  });
});
