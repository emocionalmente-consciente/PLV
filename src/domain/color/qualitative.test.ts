import { describe, expect, it } from 'vitest';
import { computeQualitative, conclusionCode } from './qualitative';

const CONCLUSIONS = { defaultCode: 'CM01', exceptions: { '32165470': 'CM02' } };
const codes = (s1: string, s2: string): Record<number, string> =>
  Object.fromEntries(computeQualitative(s1, s2, CONCLUSIONS).map((s) => [s.slot, s.baseCode]));

describe('computeQualitative', () => {
  // Traced by hand through GrabaCualitativos for the pair in the Protocolo screenshot.
  it('selects the expected base code for each slot', () => {
    expect(codes('01234567', '32165470')).toEqual({
      1: 'CA00',
      2: 'CB02',
      3: 'CC00',
      9: 'CC12',
      10: 'CC19',
      11: 'CC14',
      19: 'CD00',
      23: 'CD07',
      35: 'CE01',
      36: 'CF00',
      37: 'CG09',
      38: 'CH06',
      39: 'CJ00',
      40: 'CK01',
      41: 'CL00',
      42: 'CM02',
    });
  });

  it('leaves the slots that legacy keeps empty out of the result', () => {
    const slots = codes('76543210', '01234567');
    for (const empty of [20, 22, 24, 26, 28, 30, 32]) expect(slots[empty]).toBeUndefined();
  });

  it('never uses a slot above 42, which current legacy code does not write', () => {
    expect(Math.max(...computeQualitative('76543210', '01234567', CONCLUSIONS).map((s) => s.slot))).toBe(42);
  });

  it('compares marks between the series for the evolution of stability', () => {
    expect(codes('12345067', '12345067')[35]).toBe('CE02');
    expect(codes('01234567', '12345067')[35]).toBe('CE01');
    expect(codes('12345067', '01234567')[35]).toBe('CE03');
  });

  it.each([
    ['23401567', '23401567', 'CK03'],
    ['01234567', '23401567', 'CK01'],
    ['23401567', '01234567', 'CK05'],
  ])('compares the positions of 2, 3 and 4 for %s / %s', (s1, s2, expected) => {
    expect(codes(s1, s2)[40]).toBe(expected);
  });
});

describe('the CD05 fix', () => {
  // An achromatic color in third place gives signs +++XX___, so places 4 and 5 hold the X signs.
  it('selects CD05 when the 0 has X and its X neighbor is the 7', () => {
    expect(codes('12607345', '12607345')[21]).toBe('CD05');
  });

  it('still selects CD04 when the X neighbor is the 6', () => {
    expect(codes('12706345', '12706345')[21]).toBe('CD04');
  });
});

describe('conclusionCode', () => {
  it('uses the exception, or else the default', () => {
    expect(conclusionCode(CONCLUSIONS, '32165470')).toBe('CM02');
    expect(conclusionCode(CONCLUSIONS, '01234567')).toBe('CM01');
  });
});
