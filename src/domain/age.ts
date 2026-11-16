// Exact age. Legacy `CalculaEdad` (_Dm.pas:566) subtracts two dates and reads the two-digit year
// of the result, with a 360-day adjustment on birthdays, so it can be off and wraps at 100.
// This compares calendar dates only, so the time zone can't change the answer.

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const FIRST_VALID_YEAR = 1900;

/** Parses `YYYY-MM-DD`, or returns null when it isn't a real calendar date. */
export function parseIsoDate(text: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) return null;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > (lengths[month - 1] ?? 0)) return null;
  return { year, month, day };
}

const compare = (a: CalendarDate, b: CalendarDate): number => a.year - b.year || a.month - b.month || a.day - b.day;

/**
 * Whole years between two ISO dates. Someone born on 29 February turns a year older on 1 March in a
 * non-leap year. Throws when a date is invalid or the birth date is after `at`.
 */
export function calculateAge(birthDate: string, at: string): number {
  const birth = parseIsoDate(birthDate);
  const date = parseIsoDate(at);
  if (!birth || !date) throw new RangeError('Invalid date');
  if (compare(birth, date) > 0) throw new RangeError('The birth date is after the date of the age');
  const hadBirthday = date.month > birth.month || (date.month === birth.month && date.day >= birth.day);
  return date.year - birth.year - (hadBirthday ? 0 : 1);
}

/** Legacy didn't validate birth dates, and stored years run from 930 to 2050. */
export function isValidBirthDate(birthDate: string, today: string): boolean {
  const birth = parseIsoDate(birthDate);
  const now = parseIsoDate(today);
  return birth !== null && now !== null && birth.year >= FIRST_VALID_YEAR && compare(birth, now) <= 0;
}

/** Today's date in the device's time zone, as `YYYY-MM-DD`. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
