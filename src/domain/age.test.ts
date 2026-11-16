import { describe, expect, it } from 'vitest';
import { calculateAge, isValidBirthDate, parseIsoDate, todayIso } from './age';

describe('calculateAge', () => {
  it.each([
    ['1990-06-15', '2020-06-14', 29, 'the day before the birthday'],
    ['1990-06-15', '2020-06-15', 30, 'on the birthday, where legacy added 360 days'],
    ['1990-06-15', '2020-06-16', 30, 'the day after the birthday'],
    ['1990-12-31', '2021-01-01', 30, 'across a new year'],
    ['2000-01-01', '2000-01-01', 0, 'on the day of birth'],
    ['1920-03-01', '2026-03-01', 106, 'above 100, where legacy wrapped around'],
  ])('%s at %s is %i: %s', (birth, at, age) => {
    expect(calculateAge(birth, at)).toBe(age);
  });

  it.each([
    ['2000-02-29', '2023-02-28', 22],
    ['2000-02-29', '2023-03-01', 23],
    ['2000-02-29', '2024-02-29', 24],
  ])('handles a 29 February birth: %s at %s is %i', (birth, at, age) => {
    expect(calculateAge(birth, at)).toBe(age);
  });

  it('uses the band edges correctly for CI norms', () => {
    expect(calculateAge('2000-07-10', '2018-07-09')).toBe(17);
    expect(calculateAge('2000-07-10', '2018-07-10')).toBe(18);
  });

  it('throws for a birth date after the date', () => {
    expect(() => calculateAge('2020-01-02', '2020-01-01')).toThrow(RangeError);
  });

  it.each(['1990-13-01', '1990-02-30', 'hoy', ''])('throws for the invalid date "%s"', (date) => {
    expect(() => calculateAge(date, '2020-01-01')).toThrow(RangeError);
  });
});

describe('parseIsoDate', () => {
  it('accepts a real date', () => {
    expect(parseIsoDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it.each(['2023-02-29', '1900-02-29', '2024-00-10', '2024-04-31', '2024-1-1', '24-01-01', '2024-01-01T00:00'])('rejects %s', (text) => {
    expect(parseIsoDate(text)).toBeNull();
  });

  it('accepts 2000-02-29, because 400-year centuries are leap years', () => {
    expect(parseIsoDate('2000-02-29')).not.toBeNull();
  });
});

describe('isValidBirthDate', () => {
  const today = '2026-11-06';

  it.each(['1900-01-01', '1990-06-15', '2026-11-06'])('accepts %s', (date) => {
    expect(isValidBirthDate(date, today)).toBe(true);
  });

  // Legacy stored years from 930 to 2050.
  it.each(['0930-01-01', '1899-12-31', '2026-11-07', '2050-01-01', 'nada'])('rejects %s', (date) => {
    expect(isValidBirthDate(date, today)).toBe(false);
  });
});

describe('todayIso', () => {
  it('pads the month and day', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
