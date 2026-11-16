// Helpers shared by the qualitative selector and the P4 and CE trait rules.
import { charAt1, pos1 } from './position';
import { computeProtocol } from './protocol';

export interface ColorContext {
  serie1: string;
  /** Serie 2, which drives the traits and the qualitative texts. */
  serie: string;
  /** Serie 2 signs. */
  signs: string;
  /** Serie 2 marks, as the protocol returns them, including `.` for none. */
  marks: string;
  /** Serie 2 letters, with `.` expanded to eight spaces, as legacy `LetrasTmp` does. */
  letters: string;
  /** Serie 1 marks. */
  serie1Marks: string;
  /** 1-based position of each color digit in Serie 2: legacy `N0` to `N7`. */
  n0: number;
  n1: number;
  n2: number;
  n3: number;
  n4: number;
  n5: number;
  n6: number;
  n7: number;
  /** Sign at a 1-based Serie 2 position. */
  sign: (position: number) => string;
}

export function buildColorContext(serie1: string, serie2: string): ColorContext {
  const protocol = computeProtocol(serie1, serie2);
  const { signs, marks, letters } = protocol.serie2;
  return {
    serie1,
    serie: serie2,
    signs,
    marks,
    letters: letters === '.' ? '        ' : letters,
    serie1Marks: protocol.serie1.marks,
    n0: pos1('0', serie2),
    n1: pos1('1', serie2),
    n2: pos1('2', serie2),
    n3: pos1('3', serie2),
    n4: pos1('4', serie2),
    n5: pos1('5', serie2),
    n6: pos1('6', serie2),
    n7: pos1('7', serie2),
    sign: (position) => charAt1(signs, position),
  };
}

/** Legacy `Contar`. */
export function countChar(char: string, text: string): number {
  return [...text].filter((c) => c === char).length;
}

/** Pascal `Div` for the positive sums the rules use. */
export const intDiv = (a: number, b: number): number => Math.trunc(a / b);

export const clamp100 = (value: number): number => Math.min(100, Math.max(0, value));

/** Legacy `ConLetras(2)`. */
export const hasLetters = (ctx: ColorContext): boolean => ctx.letters.includes('A') || ctx.letters.includes('C');

/** The legacy code also accepts `-`, but the protocol only ever writes `_`. */
export const isMinus = (sign: string): boolean => sign === '_' || sign === '-';

const OTROS = [
  '423567', '423576', '453267', '453276', '413567', '413576', '453167', '453176',
  '423167', '423176', '324567', '324576', '314267', '314276', '324167', '324176',
];

/** Legacy `CalifPositividad` (P4) and `CalifOptimismo` (CE), which are identical. */
export function positivity(ctx: ColorContext): number {
  const { n3, n4, n6, n7, serie, sign } = ctx;
  const n0 = ctx.n0;
  const plusFourThree = sign(n4) === '+' && sign(n3) === '+';
  const minusSixSeven = isMinus(sign(n6)) && isMinus(sign(n7));
  const if1 = n4 + 1 === n3 && n6 + 1 === n7 && plusFourThree && minusSixSeven;
  const if2 = n3 + 1 === n4 && n7 + 1 === n6 && plusFourThree && minusSixSeven;
  const otro = OTROS.some((o) => serie.slice(0, 4) === o.slice(0, 4) && serie.slice(6, 8) === o.slice(4, 6));
  const tail = serie.slice(5, 8);

  if (if1 && (n0 === 5 || n0 === 6)) return 90;
  if (if2 && (n0 === 5 || n0 === 6)) return 80;
  if (((if1 || if2) && (n0 === 4 || n0 === 7) && (tail === '706' || tail === '607')) || otro) return 70;
  if (n4 <= 4 && n3 <= 4 && (n6 >= 5 || n7 >= 5) && (n4 < n6 || n4 < n7 || n3 < n6 || n3 < n7)) return 60;
  if (sign(n7) === '+' && sign(n6) === '+' && n7 + 1 === n6 && isMinus(sign(n4)) && isMinus(sign(n3)) && n3 + 1 === n4) return 10;
  if (sign(n7) === '+' && sign(n6) === '+' && n6 + 1 === n7 && isMinus(sign(n4)) && isMinus(sign(n3)) && n4 + 1 === n3) return 20;
  if (n6 <= 4 && n7 <= 4 && n3 >= 5 && n4 >= 5) return 30;
  if (
    isMinus(sign(n4)) ||
    isMinus(sign(n3)) ||
    (sign(n7) === '+' && sign(n4) !== '+') ||
    (sign(n6) === '+' && sign(n7) === 'X' && sign(n4) !== '+') ||
    n7 < n4
  ) {
    return 40;
  }
  return 50;
}

const SELF_REGARD_BASE = [90, 80, 60, 50, 40, 30, 20, 10];

/** Legacy `CalifAutoEstima` (P4) and `CalifAutoValoracion` (CE), which are identical. */
export function selfRegard(ctx: ColorContext): number {
  const { n2, serie, sign, letters, marks } = ctx;
  let value = SELF_REGARD_BASE[n2 - 1] ?? 0;
  const first = serie.charAt(0);
  const firstTwo = serie.slice(0, 2);

  if (
    (n2 === 1 || n2 === 2) &&
    charAt1(letters, n2) === 'C' &&
    ['7', '0'].includes(charAt1(serie, n2 + 1)) &&
    sign(n2 + 1) === '+'
  ) {
    value += 10;
  } else if (n2 === 3 && countChar('!', marks) <= 1) {
    value += 10;
  } else if (n2 >= 6 && isMinus(sign(n2)) && (first === '7' || first === '3')) {
    value -= 5;
  } else if (firstTwo === '24' || firstTwo === '42') {
    value += 5;
  }
  return clamp100(value);
}

/**
 * Starting value for Autodominio (P4) and Tolerancia a la Frustración (CE), by the number of
 * `=` signs. The legacy `Case` stops at 4, so 5 signs kept the previous examinee's value.
 * The value for 5 continues from the last one, because a pure function has no previous value.
 */
export function baseFromEquals(signs: string): number {
  const table = [10, 25, 50, 75, 90, 90];
  return table[countChar('=', signs)] ?? 90;
}
