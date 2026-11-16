import { describe, expect, it } from 'vitest';
import {
  buscaExcepciones,
  buscaPares,
  computeProtocol,
  isValidSerie,
  letras,
  marcaPares,
  signosAdmir,
  tipoPar,
} from './protocol';

const OPEN = '????????';
const BASE = '01234567';

describe('isValidSerie', () => {
  it.each(['01234567', '76543210'])('accepts %s', (serie) => {
    expect(isValidSerie(serie)).toBe(true);
  });

  it.each(['', '0123456', '012345678', '01234566', '01234568', '0123456a'])('rejects "%s"', (serie) => {
    expect(isValidSerie(serie)).toBe(false);
  });
});

describe('tipoPar', () => {
  it.each([
    ['M, same order', '01234567', 2, 'M'],
    ['M, reversed', '76543210', 2, 'M'],
    ['I, only the left neighbor matches', '01345672', 2, 'I'],
    ['D, only the right neighbor matches', '12034567', 2, 'D'],
    ['S, no neighbor matches', '31402567', 2, 'S'],
    ['I at the last position', '70123456', 7, 'I'],
    ['D near the end', '50123467', 7, 'D'],
    ['S near the end', '57012634', 7, 'S'],
  ])('%s', (_name, comp, position, expected) => {
    expect(tipoPar(BASE, comp, position)).toBe(expected);
  });

  it('checks only the right neighbor at position 1', () => {
    expect(tipoPar(BASE, '10234567', 1)).toBe('D');
    expect(tipoPar(BASE, '20314567', 1)).toBe('S');
  });

  it('checks only the left neighbor at position 8', () => {
    expect(tipoPar(BASE, '01234576', 8)).toBe('I');
    expect(tipoPar(BASE, '70123456', 8)).toBe('S');
  });
});

describe('buscaExcepciones', () => {
  it('carries + left from an achromatic color in third place', () => {
    expect(buscaExcepciones('27635410', '27635410', OPEN)).toBe('+++??___');
  });

  it('carries + left from an achromatic color in second place', () => {
    expect(buscaExcepciones('17234506', '17234506', OPEN)).toBe('++????__');
  });

  it('carries _ right from a basic color in seventh place', () => {
    expect(buscaExcepciones('32467510', '32467510', OPEN)).toBe('++????__');
  });

  it('sets no _ for a basic color in last place, so the fallback applies', () => {
    expect(buscaExcepciones('32156074', '32156074', OPEN)).toBe('++????__');
  });

  it.each([
    ['M', '01234567', '++????__'],
    ['S', '31402567', '++????__'],
    ['I', '01345672', '++????__'],
  ])('uses two + when position 2 is type %s', (_type, comp, expected) => {
    expect(buscaExcepciones(BASE, comp, OPEN)).toBe(expected);
  });

  it('uses one + when position 2 is type D', () => {
    expect(buscaExcepciones(BASE, '32165470', OPEN)).toBe('+??????_');
  });

  it.each([
    ['D', '50123467', '++????__'],
    ['S', '57012634', '++????__'],
  ])('uses two _ when position 7 is type %s', (_type, comp, expected) => {
    expect(buscaExcepciones(BASE, comp, OPEN)).toBe(expected);
  });

  it('uses one _ when position 7 is type I', () => {
    expect(buscaExcepciones(BASE, '70123456', OPEN)).toBe('++?????_');
  });
});

describe('buscaPares', () => {
  it('numbers each new pair', () => {
    expect(buscaPares(BASE, BASE, OPEN)).toBe('11234567');
  });

  it('changes nothing without shared neighbors', () => {
    expect(buscaPares(BASE, '02461357', OPEN)).toBe(OPEN);
  });

  it('keeps signs that are already set', () => {
    expect(buscaPares(BASE, BASE, '++????__')).toBe('++1234__');
  });
});

describe('marcaPares', () => {
  it('marks two X when both positions are open', () => {
    expect(marcaPares('+??????_', BASE, '31402567')).toBe('+XX====_');
  });

  it('joins different pair numbers when the two colors are adjacent in the other series', () => {
    expect(marcaPares('+12????_', BASE, '01234567')).toBe('+XX====_');
    expect(marcaPares('+12????_', BASE, '21034567')).toBe('+XX====_');
  });

  it('marks one X when the two colors are not adjacent in the other series', () => {
    expect(marcaPares('+12????_', BASE, '02461357')).toBe('+X=====_');
  });
});

describe('signosAdmir', () => {
  it('returns . without conflicts', () => {
    expect(signosAdmir('12345067')).toBe('.');
  });

  it('marks each position in its own columns', () => {
    expect(signosAdmir('75643021')).toBe('!!!    !          ! !!!!');
    expect(signosAdmir('01234567')).toBe('!!!                     ');
  });

  it('never marks violet (5), whatever its position', () => {
    expect(signosAdmir('51234067')).toBe('.');
    expect(signosAdmir('12340675')).toBe('.');
  });

  it('always returns 24 columns when there are marks', () => {
    expect(signosAdmir('76012345')).toHaveLength(24);
  });
});

describe('letras', () => {
  it('returns . without compensations or anxieties', () => {
    expect(letras('12345067')).toBe('.');
  });

  it('carries C left and A right', () => {
    expect(letras('23715460')).toBe('CCC  AAA');
  });

  it('adds A in last place when there is only a C', () => {
    expect(letras('72351604')).toBe('C      A');
    expect(letras('01234567')).toBe('C      A');
  });

  it('adds C in first place when there is only an A', () => {
    expect(letras('32165470')).toBe('C    AAA');
  });
});

describe('computeProtocol', () => {
  it('rejects a series that is not a permutation', () => {
    expect(() => computeProtocol('0123456', BASE)).toThrow(RangeError);
    expect(() => computeProtocol(BASE, '00000000')).toThrow(RangeError);
  });

  it('matches the legacy Protocolo screenshot', () => {
    expect(computeProtocol('01234567', '32165470')).toEqual({
      serie1: { signs: '+XX====_', marks: '!!!                     ', letters: 'C      A' },
      serie2: { signs: '++X==___', marks: '                !       ', letters: 'C    AAA' },
    });
  });

  // Page numbers are the printed book pages. The legacy code is the main source, and these
  // examples are a cross-check.
  it.each([
    ['p. 79', '53241670', '52341760', '+XX====_', '+XX====_'],
    ['p. 79', '53724160', '53724061', '+++XX___', '+++XX=__'],
    ['p. 79', '32164750', '73241650', '++XX==__', '+XX===__'],
    ['p. 83', '32541670', '35214670', '+XX===__', '+XX===__'],
    ['p. 85', '23540176', '53240167', '++X==___', '++X==___'],
    ['p. 86', '12735406', '17235460', '+++XX___', '++X==___'],
    ['p. 88', '32145607', '31245670', '+XX===__', '+XX===__'],
    ['p. 88', '32145760', '32145760', '++XX==__', '++XX==__'],
  ])('matches the signs in the book example on %s for %s / %s', (_page, serie1, serie2, signs1, signs2) => {
    const protocol = computeProtocol(serie1, serie2);
    expect(protocol.serie1.signs).toBe(signs1);
    expect(protocol.serie2.signs).toBe(signs2);
  });

  it('follows the code where the book example on p. 79 differs', () => {
    // That example illustrates only the last pair, and shows +++XX=__ for the second series.
    // Page 78 gives the same series ++X, which agrees with the code.
    expect(computeProtocol('32764150', '32164750').serie2.signs).toBe('++X===__');
  });

  it.each([
    ['23715460', 'CCC  AAA'],
    ['37251640', 'CC    AA'],
    ['72351604', 'C      A'],
    ['32741560', 'CCC    A'],
    ['32475016', 'C     AA'],
    ['73241560', 'C      A'],
    ['76015324', 'CCC  AAA'],
  ])('matches the letters in the book for %s', (serie, expected) => {
    expect(computeProtocol(serie, BASE).serie1.letters).toBe(expected);
  });

  it('matches the conflict example in the book on p. 74', () => {
    const protocol = computeProtocol('75643021', '57463210');
    expect(protocol.serie1.marks).toBe('!!!    !          ! !!!!');
    expect(protocol.serie2.marks).toBe('   ! !          ! ! !   ');
  });

  it('gives the same result when called twice, so no state is kept', () => {
    const first = computeProtocol('32164750', '73241650');
    computeProtocol('76543210', '01234567');
    expect(computeProtocol('32164750', '73241650')).toEqual(first);
  });
});

function allPermutations(): string[] {
  const result: string[] = [];
  const visit = (prefix: string, rest: string): void => {
    if (rest === '') result.push(prefix);
    for (let i = 0; i < rest.length; i++) {
      visit(prefix + rest.charAt(i), rest.slice(0, i) + rest.slice(i + 1));
    }
  };
  visit('', BASE);
  return result;
}

describe('all 40,320 permutations', () => {
  const permutations = allPermutations();

  it('generates every permutation once', () => {
    expect(new Set(permutations).size).toBe(40320);
  });

  it('never throws and always gives well-formed output', () => {
    const count = permutations.length;
    let bad = 0;
    permutations.forEach((serie, index) => {
      // All 1.6 billion pairs would be too slow, so each one meets fixed and varied partners.
      const partners = [serie, BASE, '76543210', permutations[(index * 7919 + 13) % count] ?? BASE];
      for (const partner of partners) {
        const { serie1, serie2 } = computeProtocol(serie, partner);
        for (const side of [serie1, serie2]) {
          const valid =
            /^[+X=_]{8}$/.test(side.signs) &&
            /\+/.test(side.signs) &&
            /_/.test(side.signs) &&
            (side.marks === '.' || /^[! ]{24}$/.test(side.marks)) &&
            (side.letters === '.' || /^[CA ]{8}$/.test(side.letters));
          if (!valid) bad++;
        }
      }
    });
    expect(bad).toBe(0);
  });
});
