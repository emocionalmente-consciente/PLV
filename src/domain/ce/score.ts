// PsicoEmocional scoring, ported from UAlgoritAutoDescW.pas, UAlgoritColorIntraW.pas and
// UAlgoritColorInterW.pas. The color protocol is shared with P4.
//
// Deliberate differences from legacy, decided after review. Several legacy conditions read
// `ConLetras(2) = False and (...)`, and in Pascal `and` binds tighter than `=`, so legacy ignored
// the list after it. Sobre Esfuerzo has `A and (one sign) or (two signs)`, which skipped `A`. New
// sessions follow the conditions as written, so Laboriosidad, Sobre Esfuerzo, Afán de Triunfo and
// the two scores built on them no longer match legacy. Each case is marked "as written".
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
} from '../color/context';
import { charAt1, charOrEnd1, tableAt1 } from '../color/position';
import { CE_TRAITS, type TraitScore } from '../traits';

/** Raw questionnaire points for each factor, in legacy order `2.1` to `2.6`. */
export type CeRawFactors = readonly [number, number, number, number, number, number];

/** The trait for each factor, in legacy order `2.1` to `2.6`. */
export const CE_FACTOR_TRAITS: readonly string[] = [
  CE_TRAITS.catalizadorCambios,
  CE_TRAITS.consideracionDemas,
  CE_TRAITS.influencia,
  CE_TRAITS.dominioEmpuje,
  CE_TRAITS.lealtadGrupal,
  CE_TRAITS.comunicacion,
];

export interface CeScoringRow {
  itemId: string;
  traitId: string;
  points: { A: number; B: number; C: number };
}

export interface CeAnswer {
  itemId: string;
  option: 'A' | 'B' | 'C';
}

/** Legacy `AcumulaRasgos`. Throws on an answer to an item with no scoring row. */
export function sumCeFactors(answers: readonly CeAnswer[], scoring: readonly CeScoringRow[]): CeRawFactors {
  const totals = [0, 0, 0, 0, 0, 0];
  for (const { itemId, option } of answers) {
    const row = scoring.find((s) => s.itemId === itemId);
    if (!row) throw new RangeError(`No scoring row for ${itemId}`);
    const factor = CE_FACTOR_TRAITS.indexOf(row.traitId);
    if (factor < 0) throw new RangeError(`${row.traitId} is not a CE factor`);
    totals[factor] = (totals[factor] ?? 0) + row.points[option];
  }
  return totals as unknown as CeRawFactors;
}

/** Legacy `AjustaRasgoWs`. A total above 10 is left unchanged, as in legacy. */
export function adjustFactor(factor: number, raw: number): number {
  if (factor === 1 || factor === 4 || factor === 6) {
    if (raw <= 1) return -20;
    if (raw <= 3) return -10;
    if (raw <= 6) return 0;
    if (raw === 7) return 10;
    if (raw === 8) return 20;
    if (raw <= 10) return 30;
    return raw;
  }
  if (raw <= 2) return -10;
  if (raw <= 5) return 0;
  if (raw === 6) return 10;
  if (raw === 7) return 20;
  if (raw === 8) return 30;
  if (raw <= 10) return 40;
  return raw;
}

export function toleranciaFrustracion(ctx: ColorContext): number {
  const { n1, n3, n7, sign, signs, letters } = ctx;
  let value = baseFromEquals(signs);
  if (!(sign(n1) === '+' && sign(n7) === '+')) {
    if (sign(n7) === '+') value -= 5;
    else if (sign(n1) === '+' && charAt1(letters, n1) !== 'A') value += 10;
  }
  if (sign(n3) === '+' && sign(n7) === '+') value -= 5;
  return clamp100(value);
}

const FOUR_LONG = ['3412', '3421', '4312', '4321', '3452', '3425', '4325', '4352'];
const FOUR_LONG_SHORT_LIST = FOUR_LONG.slice(0, 6);
const FIVE_LONG = ['34712', '34721', '43712', '43721', '34752', '34725', '43725', '43752'];
const FIVE_LONG_SHORT_LIST = FIVE_LONG.slice(0, 6);
const LABORIOSIDAD_BY_N4 = [50, 50, 50, 40, 30, 20, 10, 0];

export function laboriosidad(ctx: ColorContext): number {
  const { n0, n1, n2, n3, n4, n5, n7, serie, sign } = ctx;
  const letters = hasLetters(ctx);
  const start3 = serie.slice(0, 3);
  const caso1 =
    ((start3 === '342' || start3 === '432') && sign(n4) === '+' && sign(n3) === '+' && sign(n2) === 'X' && !letters) ||
    (sign(n4) === '+' && sign(n4 + 1) !== '+' && n4 === 1 && !letters);
  const caso2 =
    ((start3 === '324' || start3 === '234') && sign(n4) === 'X' && sign(n3) === '+' && sign(n2) === '+' && !letters) ||
    (sign(n3) === '+' && sign(n4) === 'X' && n3 === 1);

  if (caso1 && isMinus(sign(n0))) return 90;
  if (caso2 && isMinus(sign(n0))) return 80;
  // As written. These lists need 3 X signs and the protocol has at most 2, so they can't fire.
  const listSigns = sign(n1) === 'X' && sign(n2) === 'X' && sign(n3) === '+' && sign(n4) === '+' && sign(n5) === 'X';
  const start4 = serie.slice(0, 4);
  if (
    (caso1 && sign(n0) === '=') ||
    (caso2 && sign(n0) === '=') ||
    (!letters && FOUR_LONG.includes(start4) && listSigns && isMinus(sign(n0)))
  ) {
    return 75;
  }
  if (!letters && FOUR_LONG_SHORT_LIST.includes(start4) && listSigns && sign(n0) === '=') return 75;

  const start5 = serie.slice(0, 5);
  const withSeven = letters && listSigns && sign(n7) === '+';
  if (withSeven && FIVE_LONG.includes(start5) && isMinus(sign(n0))) return 60;
  if (withSeven && FIVE_LONG_SHORT_LIST.includes(start5) && sign(n0) === '=') return 60;

  let value = tableAt1(LABORIOSIDAD_BY_N4, n4);
  if (n3 <= 3) value += 10;
  if (n3 >= 7) value -= 10;
  return clamp100(value);
}

export function respuestaSobreEsfuerzo(ctx: ColorContext): number {
  const { n0, n1, n2, n3, n4, n5, n6, n7, serie, sign, signs, marks } = ctx;
  const equals = countChar('=', signs);
  const letters = hasLetters(ctx);
  const noMarksAnd34 = countChar('!', marks) === 0 && (equals === 3 || equals === 4);

  // As written: every condition applies, with one or two accepted signs on the 7.
  const casos1o3 = (signo: string): boolean => noMarksAnd34 && n1 === 1 && sign(n1) === '+' && !letters && signo.includes(sign(n7));
  const casos2o4 = (signo: string): boolean =>
    noMarksAnd34 && (n2 === 1 || n3 === 1 || n4 === 1 || n5 === 1) && !letters && signo.includes(sign(n7));

  const caso5 =
    (sign(n3) === '+' && sign(n6) === '+' && charAt1(serie, n3 + 1) === '6') ||
    (sign(n3) === '+' && sign(n4) === '+' && sign(n6) === '+' && charAt1(serie, n3 + 1) === '4' && charAt1(serie, n4 + 1) === '6') ||
    sign(n7) === '+' ||
    equals === 0;

  if (casos1o3('_-')) return 100;
  if (casos2o4('_-')) return 90;
  if (casos1o3('=')) return 80;
  // Legacy `Caso4` also has a branch needing `Contar('=', Serie) = 2`, which is never true.
  if (casos2o4('=')) return 70;
  if (caso5) return 40;
  if (isMinus(sign(n1)) || isMinus(sign(n2)) || isMinus(sign(n3)) || isMinus(sign(n4)) || n6 <= 2 || n0 <= 2) return 50;
  return 60;
}

const AFAN_STARTS = ['347', '327', '340', '237', '437', '320', '430', '230'];
const AFAN_SECOND_STARTS = ['34', '43', '32', '42'];
const AFAN_BY_N3 = [70, 70, 60, 50, 40, 30, 20, 10];

export function afanTriunfo(ctx: ColorContext): number {
  const { n0, n2, n3, n4, n7, serie, sign, letters } = ctx;
  const allC = (...positions: number[]): boolean => positions.every((p) => charAt1(letters, p) === 'C');
  const allPlus = (...positions: number[]): boolean => positions.every((p) => sign(p) === '+');
  const has = hasLetters(ctx);

  // As written. The 100 needs 5 + signs and the protocol has at most 3. The 90 needs 3 + signs with
  // no letters, which allows at most 2. The 85 comes after the 90 with the same test. None can fire.
  if (has && AFAN_STARTS.includes(serie.slice(0, 3)) && allPlus(n0, n2, n3, n4, n7) && allC(n0, n2, n3, n4, n7)) return 100;
  const caso2 = !has && AFAN_SECOND_STARTS.includes(serie.slice(0, 2)) && allPlus(n2, n3, n4);
  if (caso2) return 90;
  if (sign(n3) === '+' && !isMinus(sign(n2)) && !isMinus(sign(n4))) return 80;
  return tableAt1(AFAN_BY_N3, n3);
}

const POSITIVITY_FOR_CE = new Map([[50, 70], [60, 80], [70, 90], [80, 100], [90, 50], [100, 50]]);

/** Legacy `CalificaCEIntra` in the `W` unit. */
export function ceIntrapersonal(tolerance: number, regard: number, labor: number, optimism: number, effort: number, drive: number): number {
  const parts = [
    tolerance > 49 ? tolerance + 10 : tolerance,
    POSITIVITY_FOR_CE.get(regard) ?? regard,
    labor,
    optimism,
    effort > 59 ? effort + 5 : effort,
    drive === 100 || drive === 90 || drive === 85 ? 50 : drive,
  ];
  return Math.min(100, intDiv(parts.reduce((a, b) => a + b, 0), 6));
}

const CATALIZADOR_BY_N5 = [70, 60, 60, 50, 45, 40, 30, 20];

export function catalizadorBase(ctx: ColorContext): number {
  const { n4, n5, serie, serie1, sign } = ctx;
  // N5 or N4 can be 8, so legacy reads one place past the end of the series.
  const fiveThenFour = charOrEnd1(serie, n5 + 1) === '4';
  const fourThenFive = charOrEnd1(serie, n4 + 1) === '5';
  if (sign(n5) === '+' && sign(n4) === '+' && (n5 === 1 || fiveThenFour || fourThenFive)) return 70;
  if ((sign(n5) === 'X' && sign(n4) === 'X' && (n5 === 3 || n4 === 3)) || fiveThenFour || fourThenFive) return 60;
  // Legacy also tests `Signos[N5] = 'A'` here, which is never true because signs hold no letters.
  const value = tableAt1(CATALIZADOR_BY_N5, n5);
  return serie === serie1 ? value - 10 : value;
}

const CONSIDERACION_BY_N1 = [45, 40, 40, 35, 35, 30, 20, 10];

export function consideracionBase(ctx: ColorContext): number {
  const { n1, n4, serie, sign } = ctx;
  const letters = hasLetters(ctx);
  const oneThenFour = (): boolean => charAt1(serie, n1 + 1) === '4';
  const fourThenOne = (): boolean => charAt1(serie, n4 + 1) === '1';
  if (!letters && sign(n1) === '+' && sign(n4) === '+' && (oneThenFour() || fourThenOne())) return 60;
  // The second alternative isn't limited by "no letters", as in legacy.
  if ((!letters && sign(n1) === '+' && sign(n4) === 'X' && oneThenFour()) || (sign(n1) === 'X' && sign(n4) === '+' && fourThenOne())) return 55;
  if (!letters && sign(n1) === '+' && sign(n4) === '=' && oneThenFour()) return 50;
  const value = tableAt1(CONSIDERACION_BY_N1, n1);
  return isMinus(sign(n4)) ? value - 5 : value;
}

const INFLUENCE_TABLE = [70, 70, 60, 50, 40, 30, 30, 20];

/** Influencia and Dominio/Empuje share these rules and differ only in their factor. */
export function influenciaBase(ctx: ColorContext): number {
  const { n0, n2, n3, serie, sign } = ctx;
  const adjacent = (): boolean => charAt1(serie, n2 + 1) === '3' || charAt1(serie, n3 + 1) === '2';
  if (
    (sign(n2) === '+' && sign(n3) === '+' && adjacent()) ||
    (sign(n2) === 'X' && sign(n3) === 'X' && adjacent() && n2 < n0 && n3 < n0)
  ) {
    return 70;
  }
  return intDiv(tableAt1(INFLUENCE_TABLE, n2) + tableAt1(INFLUENCE_TABLE, n3), 2);
}

const LEALTAD_BY_N1 = [60, 65, 50, 40, 30, 20, 10, 0];

export function comunicacionBase(ctx: ColorContext): number {
  const { n1, n3, n4 } = ctx;
  let value = intDiv(tableAt1(INFLUENCE_TABLE, n3) + tableAt1(INFLUENCE_TABLE, n4), 2);
  if (n1 <= 3) value += 5;
  if (n1 >= 6) value -= 5;
  return value;
}

/** Every CE trait: the 15 scores legacy saves for one session. */
export function scoreCe(serie1: string, serie2: string, raw: CeRawFactors): TraitScore[] {
  const ctx = buildColorContext(serie1, serie2);
  const T = CE_TRAITS;
  const tolerance = toleranciaFrustracion(ctx);
  const regard = selfRegard(ctx);
  const labor = laboriosidad(ctx);
  const optimism = positivity(ctx);
  const effort = respuestaSobreEsfuerzo(ctx);
  const drive = afanTriunfo(ctx);
  const intra = ceIntrapersonal(tolerance, regard, labor, optimism, effort, drive);

  const withFactor = (base: number, factor: 1 | 2 | 3 | 4 | 5 | 6): number => clamp100(base + adjustFactor(factor, raw[factor - 1] ?? 0));
  const inter = [
    withFactor(catalizadorBase(ctx), 1),
    withFactor(consideracionBase(ctx), 2),
    withFactor(influenciaBase(ctx), 3),
    withFactor(influenciaBase(ctx), 4),
    withFactor(tableAt1(LEALTAD_BY_N1, ctx.n1), 5),
    withFactor(comunicacionBase(ctx), 6),
  ] as const;
  const ceInter = Math.min(100, intDiv(inter.reduce((a, b) => a + b, 0), 6));

  return [
    { traitId: T.toleranciaFrustracion, value: tolerance },
    { traitId: T.autoValoracion, value: regard },
    { traitId: T.laboriosidad, value: labor },
    { traitId: T.optimismo, value: optimism },
    { traitId: T.respuestaSobreEsfuerzo, value: effort },
    { traitId: T.afanTriunfo, value: drive },
    { traitId: T.ceIntrapersonal, value: intra },
    { traitId: T.catalizadorCambios, value: inter[0] },
    { traitId: T.consideracionDemas, value: inter[1] },
    { traitId: T.influencia, value: inter[2] },
    { traitId: T.dominioEmpuje, value: inter[3] },
    { traitId: T.lealtadGrupal, value: inter[4] },
    { traitId: T.comunicacion, value: inter[5] },
    { traitId: T.ceInterpersonal, value: ceInter },
    { traitId: T.factorGEmocional, value: Math.min(100, intDiv(ceInter + intra, 2)) },
  ];
}
