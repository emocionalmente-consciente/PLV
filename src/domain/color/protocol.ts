// Color protocol, ported from UAlgoritColor.pas (lines 122-316). UAlgoritColorW.pas holds
// identical code, so P4 and CE share this module. The legacy globals Serie1, Serie2 and Xs
// are now parameters.
import { charAt1, lastPos1, pos1, setChar1 } from './position';

export interface SerieProtocol {
  /** Eight characters from `+`, `X`, `=` and `_`. */
  signs: string;
  /** `!` marks in 24 columns, three for each position, or `.` when there are none. */
  marks: string;
  /** `C` and `A` by position, spaces elsewhere, or `.` when there are none. */
  letters: string;
}

export interface ColorProtocol {
  serie1: SerieProtocol;
  serie2: SerieProtocol;
}

/** Legacy pair types: Montado, Izquierda, Derecha and Solo. */
export type PairType = 'M' | 'I' | 'D' | 'S';

const INITIAL_SIGNS = '????????';
const LAST_PLUS_START = 3;
const FIRST_MINUS_START = 6;
const PLUS = '+';
const MINUS = '_';
const CROSS = 'X';
const EQUAL = '=';

const isAchromatic = (digit: string): boolean => '760'.includes(digit);
const isBasic = (digit: string): boolean => '4321'.includes(digit);

/** True when the text is a permutation of the digits 0 to 7. */
export function isValidSerie(serie: string): boolean {
  return /^[0-7]{8}$/.test(serie) && new Set(serie).size === 8;
}

/** Applies the sign rules for colors out of place, then the fallbacks when no sign was set. */
export function buscaExcepciones(base: string, comp: string, initialSigns: string): string {
  let signs = initialSigns;

  let carrying = false;
  for (let i = LAST_PLUS_START; i >= 1; i--) {
    if (carrying) {
      signs = setChar1(signs, i, PLUS);
    } else if (isAchromatic(charAt1(base, i))) {
      carrying = true;
      if (i !== 1) signs = setChar1(signs, i, PLUS);
    }
  }

  carrying = false;
  for (let i = FIRST_MINUS_START; i <= signs.length; i++) {
    if (carrying) {
      signs = setChar1(signs, i, MINUS);
    } else if (isBasic(charAt1(base, i))) {
      carrying = true;
      if (i !== 8) signs = setChar1(signs, i, MINUS);
    }
  }

  if (pos1(PLUS, signs) === 0) {
    const type = tipoPar(base, comp, 2);
    if (type === 'M' || type === 'I' || type === 'S') {
      signs = PLUS + PLUS + signs.slice(2);
    } else {
      signs = setChar1(signs, 1, PLUS);
    }
  }

  if (pos1(MINUS, signs) === 0) {
    const type = tipoPar(base, comp, 7);
    if (type === 'M' || type === 'D' || type === 'S') {
      signs = signs.slice(0, -2) + MINUS + MINUS;
    } else {
      signs = setChar1(signs, 8, MINUS);
    }
  }

  return signs;
}

/** Classifies position `i` of the base series by its neighbors in the other series. */
export function tipoPar(base: string, comp: string, i: number): PairType {
  const x = pos1(charAt1(base, i), comp);

  if (i >= 2 && i <= 7 && x >= 2 && x <= 7) {
    const before = charAt1(base, i - 1);
    const after = charAt1(base, i + 1);
    const compBefore = charAt1(comp, x - 1);
    const compAfter = charAt1(comp, x + 1);
    if ((before === compAfter && after === compBefore) || (before === compBefore && after === compAfter)) {
      return 'M';
    }
  }

  if (i > 1) {
    const before = charAt1(base, i - 1);
    if ((x < 8 && before === charAt1(comp, x + 1)) || (x > 1 && before === charAt1(comp, x - 1))) {
      return 'I';
    }
  }

  if (i < 8) {
    const after = charAt1(base, i + 1);
    if ((x < 8 && after === charAt1(comp, x + 1)) || (x > 1 && after === charAt1(comp, x - 1))) {
      return 'D';
    }
  }

  return 'S';
}

/** Numbers the runs of unsigned positions that are adjacent in both series. */
export function buscaPares(base: string, comp: string, initialSigns: string): string {
  let signs = initialSigns;
  let pair = 0;
  for (let i = 2; i <= 8; i++) {
    const x = pos1(charAt1(base, i), comp);
    const before = charAt1(base, i - 1);
    if ((x < 8 && before === charAt1(comp, x + 1)) || (x > 1 && before === charAt1(comp, x - 1))) {
      if (charAt1(signs, i) === '?' || charAt1(signs, i - 1) === '?') pair++;
      if (charAt1(signs, i) === '?') signs = setChar1(signs, i, String(pair));
      if (charAt1(signs, i - 1) === '?') signs = setChar1(signs, i - 1, String(pair));
    }
  }
  return signs;
}

/** Places the `X` signs after the last `+`, and turns every other open position into `=`. */
export function marcaPares(initialSigns: string, base: string, comp: string): string {
  let signs = initialSigns;
  const s = lastPos1(PLUS, signs);

  if (charAt1(signs, s + 1) !== charAt1(signs, s + 2)) {
    const first = charAt1(base, s + 1);
    const second = charAt1(base, s + 2);
    if (pos1(first + second, comp) > 0 || pos1(second + first, comp) > 0) {
      signs = setChar1(signs, s + 1, charAt1(signs, s + 2));
    }
  }
  if (s > 0 && charAt1(signs, s + 1) === charAt1(signs, s + 2)) {
    signs = setChar1(signs, s + 2, CROSS);
  }
  signs = setChar1(signs, s + 1, CROSS);

  return [...signs].map((sign) => (sign === PLUS || sign === MINUS || sign === CROSS ? sign : EQUAL)).join('');
}

/** Conflict marks: achromatic colors in the first three places, basic ones in the last three. */
export function signosAdmir(serie: string): string {
  const marks = [
    isAchromatic(charAt1(serie, 1)) ? '!!!' : '   ',
    isAchromatic(charAt1(serie, 2)) ? '! !' : '   ',
    isAchromatic(charAt1(serie, 3)) ? ' ! ' : '   ',
    '      ',
    isBasic(charAt1(serie, 6)) ? ' ! ' : '   ',
    isBasic(charAt1(serie, 7)) ? '! !' : '   ',
    isBasic(charAt1(serie, 8)) ? '!!!' : '   ',
  ].join('');
  return marks.trim() === '' ? '.' : marks;
}

/** Anxiety (`A`) and compensation (`C`) letters. Either one forces the other to appear. */
export function letras(serie: string): string {
  let result = '        ';

  let carrying = false;
  for (let i = FIRST_MINUS_START; i <= serie.length; i++) {
    if (carrying || isBasic(charAt1(serie, i))) {
      carrying = true;
      result = setChar1(result, i, 'A');
    }
  }

  carrying = false;
  for (let i = LAST_PLUS_START; i >= 1; i--) {
    if (carrying || isAchromatic(charAt1(serie, i))) {
      carrying = true;
      result = setChar1(result, i, 'C');
    }
  }

  if (result.includes('C') && !result.includes('A')) result = setChar1(result, 8, 'A');
  if (result.includes('A') && !result.includes('C')) result = setChar1(result, 1, 'C');

  return result.trim() === '' ? '.' : result;
}

function signsFor(base: string, comp: string): string {
  return marcaPares(buscaPares(base, comp, buscaExcepciones(base, comp, INITIAL_SIGNS)), base, comp);
}

function serieProtocol(base: string, comp: string): SerieProtocol {
  return { signs: signsFor(base, comp), marks: signosAdmir(base), letters: letras(base) };
}

/** Legacy `GrabaProtocolo`, as a pure function. Throws when a series isn't a permutation of 0 to 7. */
export function computeProtocol(serie1: string, serie2: string): ColorProtocol {
  if (!isValidSerie(serie1) || !isValidSerie(serie2)) {
    throw new RangeError('Each series must be a permutation of the digits 0 to 7');
  }
  return { serie1: serieProtocol(serie1, serie2), serie2: serieProtocol(serie2, serie1) };
}
