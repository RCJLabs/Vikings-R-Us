import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';

/* The night screen's plans (audit item 5), formatted the way i18n.ts does, for each branch they take. */

const packs = resolve(import.meta.dirname, '../../../../content/packs');
const en: Record<string, string> = JSON.parse(readFileSync(resolve(packs, 'core/strings/en.json'), 'utf8'));
const say = (key: string, params: Record<string, string | number>) =>
  String(new IntlMessageFormat(en[key] ?? key, 'en').format(params));

describe('planning the night', () => {
  it('says how soon the sick need medicine, and what happens without it', () => {
    expect(say('ui.family.sickLeft', { left: 1 })).toBe('sick, needs medicine tonight');
    expect(say('ui.family.sickLeft', { left: 2 })).toBe('sick, needs medicine within 2 nights');
    expect(say('ui.night.lost', { name: 'Mother', how: 'died' })).toBe('Without medicine tonight, Mother dies.');
    expect(say('ui.night.lost', { name: 'Asa', how: 'left' })).toBe(
      'Without medicine tonight, Asa is sent to live with relatives.',
    );
    expect(say('ui.night.worse', { name: 'Ulf', how: 'died', left: 1 })).toBe(
      'Without medicine tonight, Ulf stays sick: one more night without it and Ulf dies.',
    );
    expect(say('ui.night.worse', { name: 'Asa', how: 'left', left: 2 })).toBe(
      'Without medicine tonight, Asa stays sick: 2 more nights without it and Asa is sent to live with relatives.',
    );
  });

  it('names the need behind a sure sickness and the odds of the rest', () => {
    expect(say('ui.night.sickens', { name: 'Ulf', cause: 'cold' })).toBe('Without firewood tonight, Ulf falls sick.');
    expect(say('ui.night.sickens', { name: 'Ulf', cause: 'hungry' })).toBe('Without food tonight, Ulf falls sick.');
    expect(say('ui.night.risk', { need: 'both', p: 60 })).toBe(
      'Without firewood or food, anyone well at home may fall sick tonight: 60% each.',
    );
    expect(say('ui.night.risk', { need: 'hearth', p: 30 })).toMatch(/^Without firewood, .* 30% each\.$/);
  });

  it('counts the nights in debt down to the one that ends the run', () => {
    expect(say('ui.debt.banner', { n: 1, floor: -30, left: 1 })).toBe(
      "Last night ended below -30 rings. End tonight below it too and you're demoted.",
    );
    expect(say('ui.debt.banner', { n: 1, floor: -30, left: 2 })).toBe(
      "Last night ended below -30 rings. 2 more nights below it and you're demoted.",
    );
    expect(say('ui.night.debt', { floor: -30, limit: 2 })).toBe(
      "Tonight ends below -30 rings. Two nights in a row below it and you're demoted.",
    );
  });

  it('weighs an option that costs rings against tonight’s bills', () => {
    expect(say('ui.scene.purse', { rings: 40, bills: 35, draupnir: 0, phase: 'night' })).toBe(
      "You have 40 rings. Tonight's bills come to 35 if you pay them all.",
    );
    expect(say('ui.scene.purse', { rings: 40, bills: 35, draupnir: 8, phase: 'night' })).toBe(
      "You have 40 rings. Tonight's bills come to 35 if you pay them all, and Draupnir brings 8.",
    );
    expect(say('ui.scene.purse', { rings: 1, bills: 35, draupnir: 0, phase: 'morning' })).toBe(
      "You have 1 ring. Tonight's bills will come to 35 if you pay them all; today's pay comes first.",
    );
  });
});
