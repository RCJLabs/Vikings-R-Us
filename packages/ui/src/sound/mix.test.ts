import { describe, expect, it } from 'vitest';
// The places sound.yaml can give beds, from the package that checks sound.yaml.
import { SOUND_ROLES } from '../../../content-schema/src/sound-names';
import type { Screen } from '../store';
import {
  type BedChoices,
  bedFor,
  CALM_UNDER_TENSION,
  type MixInput,
  mixFor,
  ROLE_OF,
  ROLES,
  STORY_DUCK,
  TENSION_FROM,
  tensionFor,
} from './mix';

const none: BedChoices = { days: {}, endings: {} };
const own: BedChoices = { days: { 20: { gate: 'ragnarok' } }, endings: { rebirth: 'ending-dawn' } };
const at = (screen: Screen, extra: Partial<MixInput> = {}): MixInput => ({
  screen,
  day: null,
  ending: null,
  sunUsed: null,
  story: false,
  ...extra,
});
const full = { music: 1, ambience: 1 };

describe('the sound for each place', () => {
  it('gives every screen a bed: the menus share the title, the results share the tally', () => {
    expect(bedFor(at('title'), none)).toBe('title');
    expect(bedFor(at('campaign'), none)).toBe('title');
    expect(bedFor(at('briefing'), none)).toBe('title');
    expect(bedFor(at('shift'), none)).toBe('gate');
    expect(bedFor(at('summary'), none)).toBe('tally');
    expect(bedFor(at('endless'), none)).toBe('tally');
    expect(bedFor(at('audit'), none)).toBe('tally');
    expect(bedFor(at('morning'), none)).toBe('morning');
    expect(bedFor(at('night'), none)).toBe('night');
    expect(bedFor(at('ending'), none)).toBe('ending');
    expect(Object.keys(ROLE_OF)).toHaveLength(10);
    expect([...ROLES]).toEqual([...SOUND_ROLES]);
    expect(new Set(Object.values(ROLE_OF))).toEqual(new Set(ROLES));
  });

  it("takes a day's own bed for its places, and an ending's own on the ending screen", () => {
    expect(bedFor(at('shift', { day: 20 }), own)).toBe('ragnarok');
    // Only the places the day names: Day 20's night is still the night.
    expect(bedFor(at('night', { day: 20 }), own)).toBe('night');
    expect(bedFor(at('shift', { day: 19 }), own)).toBe('gate');
    expect(bedFor(at('ending', { day: 20, ending: 'rebirth' }), own)).toBe('ending-dawn');
    expect(bedFor(at('ending', { day: 20, ending: 'demoted' }), own)).toBe('ending');
  });
});

describe('the tension layer', () => {
  it('is silent through the first half of the sun, then rises to full at dusk and stays there', () => {
    expect(tensionFor(null)).toBe(0);
    expect(tensionFor(0)).toBe(0);
    expect(tensionFor(TENSION_FROM)).toBe(0);
    expect(tensionFor(0.75)).toBeCloseTo(0.5);
    expect(tensionFor(1)).toBe(1);
    expect(tensionFor(1.2)).toBe(1);
  });

  it('only ever rises as the sun sinks', () => {
    let last = 0;
    for (let i = 0; i <= 100; i++) {
      const t = tensionFor(i / 100);
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
  });

  it('takes over from the calm music at the gate, at the music volume', () => {
    const dawn = mixFor(at('shift', { sunUsed: 0 }), none, full);
    expect(dawn).toMatchObject({ bed: 'gate', music: 1, tension: 0, ambience: 1 });
    const dusk = mixFor(at('shift', { sunUsed: 1 }), none, { music: 0.5, ambience: 1 });
    expect(dusk.tension).toBe(0.5);
    expect(dusk.music).toBeCloseTo(0.5 * (1 - CALM_UNDER_TENSION));
    // No sun, no tension, however long the shift.
    expect(mixFor(at('shift', { sunUsed: null }), none, full).tension).toBe(0);
  });
});

describe('story text', () => {
  it('drops the music and the ambience while it is on screen', () => {
    const plain = mixFor(at('morning'), none, full);
    const read = mixFor(at('morning', { story: true }), none, full);
    expect(read.music).toBeCloseTo(plain.music * STORY_DUCK.music);
    expect(read.ambience).toBeCloseTo(plain.ambience * STORY_DUCK.ambience);
    expect(read.music).toBeLessThan(read.ambience);
  });
});

describe("the player's volumes", () => {
  it('scale each part, and nothing plays at 0', () => {
    const quiet = mixFor(at('shift', { sunUsed: 0.9 }), none, { music: 0, ambience: 0 });
    expect(quiet).toMatchObject({ music: 0, tension: 0, ambience: 0 });
    const half = mixFor(at('night'), none, { music: 0.5, ambience: 0.25 });
    expect(half).toMatchObject({ bed: 'night', music: 0.5, ambience: 0.25, tension: 0 });
  });
});
