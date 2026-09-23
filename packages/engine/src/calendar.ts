/**
 * Calendar math for Daily numbering, integer-only (Howard Hinnant's
 * days_from_civil). The UI reads the player's local date and passes it in;
 * the engine never reads a clock.
 */
export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

/**
 * Daily #1. Changing this renumbers every Daily, so pin it before the public
 * alpha ships.
 */
export const DAILY_EPOCH: CivilDate = { year: 2026, month: 12, day: 1 };

const floorDiv = (a: number, b: number): number => Math.floor(a / b);

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function isValidCivilDate({ year, month, day }: CivilDate): boolean {
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month) || !Number.isSafeInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1) return false;
  const max = month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] as number);
  return day <= max;
}

/** Days since 1970-01-01 in the proleptic Gregorian calendar. */
export function daysFromCivil({ year, month, day }: CivilDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = floorDiv(y, 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = floorDiv(153 * mp + 2, 5) + day - 1;
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Daily puzzle number for a local calendar date; #1 is DAILY_EPOCH. */
export function dailyNumber(date: CivilDate): number {
  if (!isValidCivilDate(date)) {
    throw new RangeError(`Invalid date ${date.year}-${date.month}-${date.day}`);
  }
  return daysFromCivil(date) - daysFromCivil(DAILY_EPOCH) + 1;
}

export function dailySeed(n: number): string {
  return `daily:${n}`;
}
