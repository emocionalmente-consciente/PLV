// Checks across the whole input space. The witness file holds one synthetic input pair for every
// base code and trait value the rules can produce, so each outcome has a named test. These pin
// current behavior: correctness against legacy comes from the hand-worked tests and the oracle.
import { describe, expect, it } from 'vitest';
import { type CeRawFactors, scoreCe } from './ce/score';
import { scoreP4 } from './color/p4';
import { computeQualitative } from './color/qualitative';
import witnesses from './scoring-witnesses.json';

const CONCLUSIONS = { defaultCode: 'CM01', exceptions: {} };
const NEUTRAL: CeRawFactors = [5, 5, 5, 5, 5, 5];

function allPermutations(): string[] {
  const result: string[] = [];
  const visit = (prefix: string, rest: string): void => {
    if (rest === '') result.push(prefix);
    for (let i = 0; i < rest.length; i++) visit(prefix + rest.charAt(i), rest.slice(0, i) + rest.slice(i + 1));
  };
  visit('', '01234567');
  return result;
}

const permutations = allPermutations();

function forEveryPair(visit: (serie1: string, serie2: string) => void): void {
  permutations.forEach((serie2, index) => {
    const partners = [serie2, permutations[(index * 7919 + 13) % permutations.length] ?? serie2, '01234567', '76543210'];
    for (const serie1 of partners) visit(serie1, serie2);
  });
}

describe('every permutation', () => {
  it('never throws, and keeps every score between 0 and 100', () => {
    let outOfRange = 0;
    const extremes: CeRawFactors[] = [NEUTRAL, [0, 0, 0, 0, 0, 0], [10, 10, 10, 10, 10, 10]];
    forEveryPair((serie1, serie2) => {
      computeQualitative(serie1, serie2, CONCLUSIONS);
      const all = [...scoreP4(serie1, serie2), ...extremes.flatMap((raw) => scoreCe(serie1, serie2, raw))];
      outOfRange += all.filter((s) => !Number.isInteger(s.value) || s.value < 0 || s.value > 100).length;
    });
    expect(outOfRange).toBe(0);
  }, 120_000);

  it('produces every base code except the ones the rules can never reach', () => {
    const seen = new Set<string>();
    forEveryPair((serie1, serie2) => {
      for (const { baseCode } of computeQualitative(serie1, serie2, CONCLUSIONS)) seen.add(baseCode);
    });
    const expected = ['CA00', 'CC00', 'CD00', 'CF00', 'CJ00', 'CL00', 'CM01'];
    const add = (prefix: string, from: number, to: number): void => {
      for (let i = from; i <= to; i++) expected.push(`${prefix}${String(i).padStart(2, '0')}`);
    };
    add('CB', 1, 9);
    add('CC', 1, 33);
    add('CD', 1, 31);
    add('CE', 1, 3);
    add('CG', 1, 10);
    add('CH', 1, 14);
    add('CK', 1, 5);
    // CH04 contradicts itself. CH02, CH03, CH10 and CH11 are always caught by an earlier branch.
    expect(expected.filter((code) => !seen.has(code)).sort()).toEqual(['CH02', 'CH03', 'CH04', 'CH10', 'CH11']);
  }, 120_000);
});

describe('witnesses', () => {
  it.each(Object.entries(witnesses.codes))('base code %s', (code, witness) => {
    const [serie1, serie2, slot] = witness as [string, string, number];
    const found = computeQualitative(serie1, serie2, CONCLUSIONS).find((s) => s.slot === slot);
    expect(found?.baseCode).toBe(code);
  });

  it.each(Object.entries(witnesses.traits))('trait outcome %s', (outcome, witness) => {
    const [serie1, serie2] = witness as [string, string];
    const [traitId, value] = outcome.split('=');
    const all = [...scoreP4(serie1, serie2), ...scoreCe(serie1, serie2, NEUTRAL)];
    expect(all.find((s) => s.traitId === traitId)?.value).toBe(Number(value));
  });
});
