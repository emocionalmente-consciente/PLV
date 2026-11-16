import { describe, expect, it } from 'vitest';
import { P4_TRAITS as T } from '../traits';
import { type CiNorms, CiValidationError, ciLevel, scoreCi } from './score';

// Synthetic norms, with a different slope per band so a wrong band is visible.
const table = (start: number): number[] => Array.from({ length: 37 }, (_, raw) => start + raw * 2);
const NORMS: CiNorms = {
  bands: [
    { id: 'young', minAge: 18, maxAge: 30 },
    { id: 'middle', minAge: 31, maxAge: 45 },
    { id: 'older', minAge: 46, maxAge: 150 },
  ],
  table: { young: table(50), middle: table(60), older: table(70) },
};
const RAW = { verbal: 10, numeric: 8, spatial: 6 };

describe('scoreCi', () => {
  it('looks up each factor at its raw score times 3', () => {
    const result = scoreCi(RAW, 25, NORMS);
    expect(result.verbal).toBe(50 + 30 * 2);
    expect(result.numeric).toBe(50 + 24 * 2);
    expect(result.spatial).toBe(50 + 18 * 2);
  });

  it('looks up the global score at the plain sum', () => {
    const result = scoreCi(RAW, 25, NORMS);
    expect(result.rawTotal).toBe(24);
    expect(result.global).toBe(50 + 24 * 2);
  });

  it('returns the four CI traits', () => {
    const byTrait = Object.fromEntries(scoreCi(RAW, 25, NORMS).scores.map((s) => [s.traitId, s.value]));
    expect(byTrait).toEqual({
      [T.ciGlobal]: 98,
      [T.factorVerbal]: 110,
      [T.factorNumerico]: 98,
      [T.factorEspacial]: 86,
    });
  });

  it.each([
    [18, 50],
    [30, 50],
    [31, 60],
    [45, 60],
    [46, 70],
    [150, 70],
  ])('uses the right band at age %i', (age, start) => {
    expect(scoreCi({ verbal: 0, numeric: 0, spatial: 0 }, age, NORMS).global).toBe(start);
  });

  it.each([17, 0, 151])('blocks age %i with a clear error, where legacy gave an undefined result', (age) => {
    expect(() => scoreCi(RAW, age, NORMS)).toThrow(CiValidationError);
    try {
      scoreCi(RAW, age, NORMS);
    } catch (error) {
      expect((error as CiValidationError).code).toBe('age-out-of-range');
    }
  });

  it('blocks a missing norm row', () => {
    const short: CiNorms = { ...NORMS, table: { ...NORMS.table, young: [50, 52] } };
    expect(() => scoreCi(RAW, 25, short)).toThrow(CiValidationError);
  });

  it('blocks a band with no table', () => {
    const missing: CiNorms = { bands: NORMS.bands, table: {} };
    expect(() => scoreCi(RAW, 25, missing)).toThrow(CiValidationError);
  });

  it('scores the top raw values', () => {
    expect(scoreCi({ verbal: 12, numeric: 12, spatial: 12 }, 25, NORMS).global).toBe(50 + 36 * 2);
  });
});

describe('ciLevel', () => {
  it.each([
    [0, 1], [29, 1], [30, 2], [49, 2], [50, 3], [69, 3], [70, 4], [79, 4], [80, 5], [89, 5],
    [90, 6], [109, 6], [110, 7], [119, 7], [120, 8], [129, 8], [130, 9], [250, 9],
  ])('puts %i at level %i', (value, level) => {
    expect(ciLevel(value)).toBe(level);
  });

  it.each([-1, 251, 1.5])('returns null for %d', (value) => {
    expect(ciLevel(value)).toBeNull();
  });
});
