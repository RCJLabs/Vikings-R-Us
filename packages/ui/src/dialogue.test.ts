import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';

/* Lines that used to contradict the soul saying them (audit item 1), formatted the way i18n.ts does. */

const packs = resolve(import.meta.dirname, '../../../content/packs');
const strings = (pack: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(packs, pack, 'strings/en.json'), 'utf8'));
const en: Record<string, string> = { ...strings('core'), ...strings('campaign') };
const say = (key: string, params: Record<string, string>) =>
  String(new IntlMessageFormat(en[key] ?? key, 'en').format(params));

describe('what the dead say', () => {
  it('a braggart who died old confesses to old age, not a cough', () => {
    expect(say('q.cause.braggart.confess.1', { truth: 'oldAge' })).not.toMatch(/cough|sick/i);
    expect(say('q.cause.braggart.confess.1', { truth: 'sickness' })).toMatch(/sickness/);
  });

  it("the old don't name an age their body can contradict", () => {
    expect(say('tm.death.oldAge.1', {})).not.toMatch(/\d|seventy|eighty|sixty/i);
  });

  it('a woman in a plain disguise is a plain woman', () => {
    expect(say('tm.guise.1', { gender: 'f' })).toMatch(/plain woman/);
    expect(say('tm.guise.1', { gender: 'm' })).toMatch(/plain man/);
  });
});
