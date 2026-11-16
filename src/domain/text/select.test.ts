import { describe, expect, it } from 'vitest';
import { pickText, selectQualitativeTexts, textIdsForScore } from './select';

describe('textIdsForScore', () => {
  const bands = [
    { min: 0, max: 50, textIds: ['a'] },
    { min: 40, max: 60, textIds: ['b', 'c'] },
    { min: 70, max: 100, textIds: ['d'] },
  ];

  it('includes both ends of a band', () => {
    expect(textIdsForScore(bands, 0)).toEqual(['a']);
    expect(textIdsForScore(bands, 100)).toEqual(['d']);
  });

  it('collects every overlapping band, in order', () => {
    expect(textIdsForScore(bands, 45)).toEqual(['a', 'b', 'c']);
  });

  it('returns nothing outside every band', () => {
    expect(textIdsForScore(bands, 65)).toEqual([]);
  });
});

describe('pickText', () => {
  const options = ['a', 'b', 'c', 'd'];

  it('returns null with no options', () => {
    expect(pickText([], 'seed', 'key')).toBeNull();
  });

  it('gives the same choice for the same seed and key, so rescoring is stable', () => {
    expect(pickText(options, 'session-1', 'p4:13')).toBe(pickText(options, 'session-1', 'p4:13'));
  });

  it('can vary with the key within a session', () => {
    const picks = new Set(Array.from({ length: 50 }, (_, i) => pickText(options, 'session-1', `key-${String(i)}`)));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('can reach every option, including the last one that legacy never picked', () => {
    const picks = new Set(Array.from({ length: 200 }, (_, i) => pickText(options, `session-${String(i)}`, 'key')));
    expect(picks).toEqual(new Set(options));
  });

  it('spreads choices fairly evenly', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      const pick = pickText(options, `session-${String(i)}`, 'key') ?? '';
      counts.set(pick, (counts.get(pick) ?? 0) + 1);
    }
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1200);
    }
  });
});

describe('selectQualitativeTexts', () => {
  const variants = { CC01: ['p4:1', 'p4:2'], CA00: ['p4:3'] };

  it('chooses a text for each slot', () => {
    const selected = selectQualitativeTexts([{ slot: 1, baseCode: 'CA00' }, { slot: 4, baseCode: 'CC01' }], variants, 'seed');
    expect(selected[0]).toEqual({ slot: 1, baseCode: 'CA00', textId: 'p4:3' });
    expect(variants.CC01).toContain(selected[1]?.textId);
  });

  it('throws for a base code with no text', () => {
    expect(() => selectQualitativeTexts([{ slot: 2, baseCode: 'CB01' }], variants, 'seed')).toThrow(RangeError);
  });
});
