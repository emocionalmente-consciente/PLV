// Psicolaboral 4 trait rules, ported from UAlgoritColorIntra.pas and UAlgoritColorInter.pas.
import { P4_TRAITS, type TraitScore } from '../traits';
import {
  type ColorContext,
  baseFromEquals,
  buildColorContext,
  clamp100,
  countChar,
  hasLetters,
  intDiv,
  isMinus,
  positivity,
  selfRegard,
} from './context';
import { charAt1, tableAt1 } from './position';

/** Legacy `CalifAutodominio`. */
export function autodominio(ctx: ColorContext): number {
  const { n1, n3, n7, sign, signs, letters } = ctx;
  let value = baseFromEquals(signs);
  if (sign(n7) === '+' && sign(n3) === '+') value -= 15;
  else if (sign(n7) === '+') value -= 10;
  else if (sign(n1) === '+' && !letters.includes('C')) value += 10;
  if (value > 50) value += 10;
  return clamp100(value);
}

/** Legacy `CalifRespuestaAlStress`. */
export function respuestaEstres(ctx: ColorContext): number {
  const { n0, n1, n2, n3, n4, n5, n6, n7, sign, signs, serie, marks } = ctx;
  const noMarks = countChar('!', marks) === 0;
  const equals = countChar('=', signs);
  const letters = hasLetters(ctx);
  const oneAmong = n2 === 1 || n3 === 1 || n4 === 1 || n5 === 1;
  const threeOrFour = equals === 3 || equals === 4;

  const casos1o3 = (signo: string): boolean => noMarks && threeOrFour && n1 === 1 && sign(n1) === '+' && !letters && sign(n7) === signo;
  const casos2o4 = (signo: string): boolean => noMarks && threeOrFour && oneAmong && !letters && sign(n7) === signo;
  const caso4 =
    noMarks &&
    equals === 2 &&
    !letters &&
    (sign(n7) === '_' || sign(n7) === '=') &&
    ((n1 === 1 && sign(n1) === '+') || oneAmong);
  const caso5 =
    (sign(n3) === '+' && sign(n6) === '+' && charAt1(serie, n3 + 1) === '6') ||
    (sign(n3) === '+' && sign(n4) === '+' && sign(n6) === '+' && charAt1(serie, n3 + 1) === '4' && charAt1(serie, n4 + 1) === '6');

  if (casos1o3('_')) return 100;
  if (casos2o4('_')) return 90;
  if (casos1o3('=')) return 80;
  if (casos2o4('=')) return 70;
  if (caso4) return 70;
  if (caso5) return 50;
  if (sign(n7) === '+' && sign(n3) !== '_') return 40;
  if (isMinus(sign(n1)) || isMinus(sign(n2)) || isMinus(sign(n3)) || isMinus(sign(n4)) || n6 <= 2 || n0 <= 2) return 50;
  // Legacy also tests `Serie[N3] in ['6','8']`, which is never true because that digit is 3.
  if (equals === 0) return 30;
  return 60;
}

const POSITIVITY_FOR_CE = new Map([[50, 70], [60, 80], [70, 90], [80, 100], [90, 50], [100, 50]]);

/**
 * Legacy `CalificaCEIntra`. It adjusts the four inputs without changing their reported values,
 * and fixes Autoestima at 55, which the plan lists for confirmation.
 */
export function ceGlobal(auto: number, positive: number, stress: number): number {
  const parts = [
    auto > 49 ? auto + 10 : auto,
    POSITIVITY_FOR_CE.get(positive) ?? positive,
    55,
    stress > 59 ? stress + 5 : stress,
  ];
  return Math.min(100, intDiv(parts.reduce((a, b) => a + b, 0), 4));
}

const ACTIVIDAD_T4 = [80, 70, 60, 50, 40, 30, 20, 10];
const ACTIVIDAD_T3 = [60, 60, 50, 40, 40, 30, 20, 10];

export function actividad(ctx: ColorContext): number {
  const { n0, n1, n2, n3, n4, n5, n7, sign, letters } = ctx;
  const noC = !letters.includes('C');
  if (
    (sign(n3) === '+' && n3 === 1 && sign(n3 + 1) !== '+') ||
    (sign(n4) === 'X' && sign(n3) === 'X' && sign(n0) !== '+' && sign(n1) !== '+') ||
    (sign(n4) === '+' && sign(n2) === '+' && noC) ||
    (sign(n4) === '+' && sign(n2) === '+' && sign(n7) === '+') ||
    (sign(n4) === '+' && sign(n5) === '+' && noC) ||
    (sign(n4) === '+' && sign(n5) === '+' && sign(n7) === '+')
  ) {
    return 80;
  }
  if (
    (sign(n4) === '+' && n4 < 8 && sign(n4 + 1) !== '+' && n4 > 1 && sign(n4 - 1) !== '+') ||
    (n7 === 3 && n4 <= 2 && n3 <= 2) ||
    (noC && sign(n4) === '+' && sign(n3) === '+')
  ) {
    return 90;
  }
  const value = intDiv(tableAt1(ACTIVIDAD_T4, n4) + tableAt1(ACTIVIDAD_T3, n3), 2);
  return clamp100(sign(n1) === '+' ? value - 5 : value);
}

const CREATIVIDAD_T4 = [70, 60, 50, 40, 30, 20, 10, 5];
const CREATIVIDAD_T5 = [85, 75, 65, 55, 40, 30, 20, 10];

export function creatividad(ctx: ColorContext): number {
  const { n4, n5, n7, sign, letters } = ctx;
  if (
    (n7 === 3 && n4 <= 2 && n5 <= 2) ||
    (n4 <= 2 && n5 <= 2 && !letters.includes('C')) ||
    (sign(n5) === '+' && n5 < 8 && sign(n5 + 1) !== '+' && n5 > 1 && sign(n5 - 1) !== '+') ||
    (sign(n5) === '+' && n5 === 1 && sign(n5 + 1) !== '+')
  ) {
    return 90;
  }
  if (sign(n5) === 'X' && sign(n4) === 'X') return 80;
  return intDiv(tableAt1(CREATIVIDAD_T4, n4) + tableAt1(CREATIVIDAD_T5, n5), 2);
}

const INDEPENDENCIA_BY_N2 = [60, 50, 50, 45, 40, 35, 20, 10];

export function independencia(ctx: ColorContext): number {
  const { n1, n2, n3, n4, n5, n7, sign } = ctx;
  if (
    (n2 <= 2 && n3 <= 2 && n7 === 3) ||
    (sign(n2) === 'X' && sign(n3) === 'X' && (n7 < n2 || n7 < n3 || n5 < n2 || n5 < n3))
  ) {
    return 90;
  }
  if (
    (n2 === 1 && sign(n2) === '+' && sign(n2 + 1) !== '+') ||
    (n3 === 1 && sign(n3) === '+' && sign(n3 + 1) !== '+') ||
    (sign(n2) === 'X' && sign(n3) === 'X' && sign(n1) !== '+' && sign(n4) !== '+')
  ) {
    return 80;
  }
  if (sign(n1) === '+' && sign(n4) === '+') return 15;
  return tableAt1(INDEPENDENCIA_BY_N2, n2);
}

const LIDERAZGO_TABLE = [90, 80, 70, 60, 40, 30, 20, 10];

export function liderazgo(ctx: ColorContext): number {
  const { n2, n3, sign } = ctx;
  if (sign(n2) === 'X' && sign(n3) === 'X') return 90;
  if (sign(n2) === '+' && sign(n3) === '+') return 85;
  return intDiv(tableAt1(LIDERAZGO_TABLE, n2) + tableAt1(LIDERAZGO_TABLE, n3), 2);
}

/** Logro, Percepción de la Salud and Perseverancia share one table by position. */
const BY_POSITION = [90, 80, 70, 60, 40, 30, 20, 10];
const RESPONSABILIDAD_BY_N0 = [10, 20, 30, 40, 50, 70, 80, 90];
const SOCIABILIDAD_T3 = [70, 70, 60, 50, 40, 30, 30, 20];
const SOCIABILIDAD_T4 = [90, 80, 70, 60, 40, 30, 20, 10];

export function sociabilidad(ctx: ColorContext): number {
  const { n1, n3, n4 } = ctx;
  let value = intDiv(tableAt1(SOCIABILIDAD_T3, n3) + tableAt1(SOCIABILIDAD_T4, n4), 2);
  if (n1 <= 3) value += 5;
  if (n1 >= 6) value -= 5;
  return clamp100(value);
}

/** Every P4 color trait: the 14 scores legacy saves for one session. */
export function scoreP4(serie1: string, serie2: string): TraitScore[] {
  const ctx = buildColorContext(serie1, serie2);
  const auto = autodominio(ctx);
  const positive = positivity(ctx);
  const stress = respuestaEstres(ctx);
  const T = P4_TRAITS;
  return [
    { traitId: T.autodominio, value: auto },
    { traitId: T.autoestima, value: selfRegard(ctx) },
    { traitId: T.positividad, value: positive },
    { traitId: T.respuestaEstres, value: stress },
    { traitId: T.ceGlobal, value: ceGlobal(auto, positive, stress) },
    { traitId: T.actividad, value: actividad(ctx) },
    { traitId: T.creatividad, value: creatividad(ctx) },
    { traitId: T.independencia, value: independencia(ctx) },
    { traitId: T.liderazgo, value: liderazgo(ctx) },
    { traitId: T.logro, value: tableAt1(BY_POSITION, ctx.n3) },
    { traitId: T.percepcionSalud, value: tableAt1(BY_POSITION, ctx.n6) },
    { traitId: T.perseverancia, value: tableAt1(BY_POSITION, ctx.n2) },
    { traitId: T.responsabilidad, value: tableAt1(RESPONSABILIDAD_BY_N0, ctx.n0) },
    { traitId: T.sociabilidad, value: sociabilidad(ctx) },
  ];
}
