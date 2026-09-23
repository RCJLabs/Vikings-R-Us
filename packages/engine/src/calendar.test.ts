import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { DAILY_EPOCH, dailyNumber, dailySeed, daysFromCivil, isValidCivilDate } from './calendar';

describe('daysFromCivil', () => {
  it('counts from the Unix epoch', () => {
    expect(daysFromCivil({ year: 1970, month: 1, day: 1 })).toBe(0);
    expect(daysFromCivil({ year: 2000, month: 3, day: 1 })).toBe(11_017);
  });

  test.prop([
    fc.date({ min: new Date(Date.UTC(1600, 0, 1)), max: new Date(Date.UTC(2600, 11, 31)), noInvalidDate: true }),
  ])('agrees with Date.UTC', (d) => {
    const date = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    expect(daysFromCivil(date)).toBe(Math.floor(Date.UTC(date.year, date.month - 1, date.day) / 86_400_000));
  });
});

describe('dailyNumber', () => {
  it('numbers the epoch as Daily #1 and counts up by day', () => {
    expect(dailyNumber(DAILY_EPOCH)).toBe(1);
    expect(dailyNumber({ year: 2026, month: 12, day: 2 })).toBe(2);
    expect(dailyNumber({ year: 2027, month: 1, day: 1 })).toBe(32);
  });

  it('handles leap days', () => {
    expect(dailyNumber({ year: 2028, month: 3, day: 1 }) - dailyNumber({ year: 2028, month: 2, day: 28 })).toBe(2);
  });

  it('rejects impossible dates', () => {
    expect(isValidCivilDate({ year: 2027, month: 2, day: 29 })).toBe(false);
    expect(isValidCivilDate({ year: 2100, month: 2, day: 29 })).toBe(false);
    expect(isValidCivilDate({ year: 2000, month: 2, day: 29 })).toBe(true);
    expect(() => dailyNumber({ year: 2027, month: 13, day: 1 })).toThrow(RangeError);
  });

  it('derives a seed from the number', () => {
    expect(dailySeed(97)).toBe('daily:97');
  });
});
