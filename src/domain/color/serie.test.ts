import { describe, expect, it } from 'vitest';
import { isCompleteSerie, serieProblem } from './serie';

describe('serieProblem', () => {
  it.each(['', '0', '0123', '01234567', '76543210'])('accepts "%s"', (text) => {
    expect(serieProblem(text)).toBeNull();
  });

  it.each([
    ['8', 1],
    ['012a', 4],
    ['01 2', 3],
    ['0123459', 7],
  ])('finds the character that is not 0 to 7 in "%s"', (text, position) => {
    expect(serieProblem(text)).toEqual({ kind: 'not-a-digit', position });
  });

  it('finds a repeated digit', () => {
    expect(serieProblem('01231')).toEqual({ kind: 'repeated', position: 5, digit: '1' });
  });
});

describe('isCompleteSerie', () => {
  it.each([
    ['01234567', true],
    ['0123456', false],
    ['01234566', false],
    ['012345678', false],
  ])('"%s" gives %s', (text, expected) => {
    expect(isCompleteSerie(text)).toBe(expected);
  });
});
