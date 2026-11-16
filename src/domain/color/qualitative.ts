// Qualitative selector, ported from UAlgoritColor.pas (GrabaCualitativos, lines 318-1153).
// It returns base codes such as `CC01`. Choosing a variant is a separate step in
// `domain/text/select.ts`. A slot with no text is left out of the result.
import { type ColorContext, buildColorContext, countChar } from './context';
import { charAt1, pos1 } from './position';

export interface QualitativeSlot {
  slot: number;
  baseCode: string;
}

/** The Serie 2 conclusions table from the content pack (DATA_MODEL.md, `ConclusionMap`). */
export interface ConclusionMap {
  defaultCode: string;
  exceptions: Record<string, string>;
}

export const conclusionCode = (map: ConclusionMap, serie: string): string => map.exceptions[serie] ?? map.defaultCode;

type Code = string | null;

const TRIPLE_AT_ITS_OWN_COLOR = [1, 4, 7, 10, 13, 16, 19, 22];

/** Legacy `EstabilidadEmocionalEnGeneral`. */
export function estabilidad(ctx: ColorContext): Code {
  const adm = ctx.marks;
  const count = countChar('!', adm);
  const aligned = TRIPLE_AT_ITS_OWN_COLOR.includes(pos1('!!!', adm));
  const tripleOn = (position: number): boolean => adm.slice(position * 3 - 3, position * 3) === '!!!';
  const tripleOnKeyColor = tripleOn(ctx.n0) || tripleOn(ctx.n2) || tripleOn(ctx.n3);

  if (count === 0) return 'CB01';
  if (count === 1 || count === 2) return 'CB02';
  if (count === 3 && !aligned) return 'CB03';
  if (count === 4 && !aligned) return 'CB04';
  if ((count === 3 || count === 4) && aligned && !tripleOnKeyColor) return 'CB05';
  if (count === 5 && !aligned) return 'CB06';
  if (count === 5 && aligned && !tripleOnKeyColor) return 'CB07';
  if (count === 6 && !aligned) return 'CB09';
  if (count >= 6 || tripleOnKeyColor) return 'CB08';
  return null;
}

const isNeighbor = (center: number, other: number): boolean =>
  (center < 8 && center + 1 === other) || (center > 1 && center - 1 === other);

/** The first color in the list that is next to `center` and carries `sign`. */
function firstNeighbor(ctx: ColorContext, center: number, sign: string, options: [number, string][]): Code {
  for (const [other, code] of options) {
    if (ctx.sign(other) === sign && isNeighbor(center, other)) return code;
  }
  return null;
}

/** Legacy `CaractDeLaPersonalidad_02`. */
function zeroWithPlus(ctx: ColorContext): Code {
  const { n0, n1, n2, n3, n4, n5, n6, n7 } = ctx;
  if (ctx.sign(n0) !== '+') return null;
  return firstNeighbor(ctx, n0, '+', [[n1, 'CC02'], [n2, 'CC03'], [n3, 'CC04'], [n4, 'CC05'], [n5, 'CC05'], [n6, 'CC06'], [n7, 'CC07']]);
}

/**
 * Shared shape of the Percepción de la Realidad rules: when the color carries X, use its first
 * X neighbor, or else `alone` if either side lacks an X.
 */
function perception(ctx: ColorContext, center: number, options: [number, string][], alone: string): Code {
  if (ctx.sign(center) !== 'X') return null;
  const neighbor = firstNeighbor(ctx, center, 'X', options);
  if (neighbor) return neighbor;
  const afterLacksX = center < 8 && ctx.sign(center + 1) !== 'X';
  const beforeLacksX = center > 1 && ctx.sign(center - 1) !== 'X';
  return afterLacksX || beforeLacksX ? alone : null;
}

function trioIn(ctx: ColorContext): (...positions: number[]) => boolean {
  return (...positions) => [ctx.n2, ctx.n3, ctx.n4].every((n) => positions.includes(n));
}

/** Legacy `PronosticoLaboralEnGeneral`. Operator grouping follows the Pascal exactly. */
export function pronostico(ctx: ColorContext): string {
  const { n0: N0, n1: N1, n2: N2, n3: N3, n5: N5, n6: N6, n7: N7 } = ctx;
  const t = trioIn(ctx);
  const n0Late = N0 >= 6;
  const n0From5 = N0 >= 5;

  if (t(1, 2, 3) && n0Late) return 'CG01';
  if (n0Late && ((t(1, 3, 4) && (N5 === 2 || N1 === 2)) || (t(1, 2, 4) && (N5 === 3 || N1 === 3)))) return 'CG02';
  if (n0Late && t(2, 3, 4) && (N5 === 1 || N1 === 1)) return 'CG03';
  if (N0 === 5 && t(2, 3, 4) && (N5 === 1 || N1 === 1)) return 'CG04';
  if (N0 === 5 && t(1, 2, 3)) return 'CG05';
  if (
    (n0From5 && t(2, 3, 4) && (N6 === 1 || N7 === 1)) ||
    (t(1, 3, 4) && (N6 === 2 || N7 === 2)) ||
    (t(1, 2, 4) && (N6 === 3 || N7 === 3)) ||
    (N0 === 4 && t(1, 2, 3)) ||
    (N0 === 3 && t(1, 2, 4))
  ) {
    return 'CG06';
  }
  if (
    (n0From5 && t(3, 4, 5) && N1 <= 2 && N5 <= 2) ||
    ((N1 === 1 || N5 === 1) && (N6 === 2 || N7 === 2)) ||
    ((N1 === 2 || N5 === 2) && (N6 === 1 || N7 === 1)) ||
    (N6 <= 2 && N7 <= 2)
  ) {
    return 'CG07';
  }
  const outer = (n: number): boolean => n <= 2 || n >= 7;
  if (
    (N0 >= 7 && t(4, 5, 6)) ||
    (N0 === 3 && t(4, 5, 6) && outer(N1) && outer(N5) && outer(N6) && outer(N7)) ||
    (t(3, 4, 5) && N0 === 1 && (N1 === 2 || N5 === 2 || N6 === 2 || N7 === 2)) ||
    (t(3, 4, 5) && N0 === 2 && (N1 === 1 || N5 === 1 || N6 === 1 || N7 === 1))
  ) {
    return 'CG08';
  }
  if (t(6, 7, 8) || t(5, 7, 8) || t(5, 6, 8) || N2 >= 7 || N3 >= 7) return 'CG10';
  // The legacy condition ends in `OR (1 > 0)`, so this is the explicit fallback.
  return 'CG09';
}

/** Legacy `PrioridadesParaTrabajar`. */
export function prioridades(ctx: ColorContext): Code {
  const { n2: N2, n3: N3, n4: N4, sign } = ctx;
  const m2 = sign(N2) === '_';
  const m3 = sign(N3) === '_';
  const m4 = sign(N4) === '_';
  const early = (n: number): boolean => n === 1 || n === 2;

  // The legacy first test also has an `N2 in [1..3]` form, which the second form includes.
  if (N2 < N3 && N2 < N4 && N2 < 6) return 'CH01';
  if (early(N2) && m3 && !m4 && N4 > N2) return 'CH02';
  if (early(N2) && m4 && !m3 && N3 > N2) return 'CH03';
  if ((N3 < N2 || N3 < N4) && N3 <= 3 && N3 > N2 && N3 > N4 && N3 < 6) return 'CH04';
  if (early(N3) && m2) return 'CH05';
  if (early(N3) && m4 && N2 > N3 && !m2) return 'CH06';
  if ((N4 < N2 || N4 < N3) && N4 <= 3 && N2 < 6 && N3 < 6) return 'CH07';
  if (early(N4) && m2 && N3 > N4 && !m3) return 'CH08';
  if (early(N4) && m3 && N2 > N4 && !m2) return 'CH09';
  if (early(N2) && m3 && m4) return 'CH10';
  if (early(N3) && m4 && m2) return 'CH11';
  if (early(N4) && m2 && m3) return 'CH12';
  if (N2 > 2 && N3 > 2 && N4 > 2 && !m2 && !m3 && !m4) return 'CH13';
  if (N2 > 2 && N3 > 2 && N4 > 2 && (!m2 || !m3 || !m4)) return 'CH14';
  return null;
}

/** Legacy `EvolucionDelPronosticoLaboral`. */
export function evolucionPronostico(ctx: ColorContext): string {
  const change = ['2', '3', '4'].reduce((sum, digit) => sum + pos1(digit, ctx.serie1) - pos1(digit, ctx.serie), 0);
  if (change > 2) return 'CK01';
  if (change > 0) return 'CK02';
  if (change === 0) return 'CK03';
  if (change >= -2) return 'CK04';
  return 'CK05';
}

/** Every slot in legacy order. Slots 20, 22, 24, 26, 28, 30 and 32 are always empty there. */
export function computeQualitative(serie1: string, serie2: string, conclusions: ConclusionMap): QualitativeSlot[] {
  const ctx = buildColorContext(serie1, serie2);
  const { n0, n1, n2, n3, n4, n5, n6, n7, sign, signs, letters } = ctx;

  const stability = countChar('!', ctx.serie1Marks) - countChar('!', ctx.marks);

  // Legacy slot 4 defaults to text ID 1, which doesn't exist, so it means no text.
  const slots: [number, Code][] = [
    [1, 'CA00'],
    [2, estabilidad(ctx)],
    [3, 'CC00'],
    [4, sign(n0) === '+' ? 'CC01' : null],
    [5, zeroWithPlus(ctx)],
    [6, sign(n0) === '+' && n0 === 3 ? 'CC08' : null],
    [7, sign(n1) === '+' ? 'CC09' : null],
    [8, sign(n1) === '+' ? (charAt1(letters, n1) !== 'C' ? 'CC10' : 'CC11') : null],
    [9, sign(n2) === '+' ? 'CC12' : null],
    [10, sign(n3) === '+' ? 'CC19' : null],
    [11, sign(n2) === '+' ? firstNeighbor(ctx, n2, '+', [[n1, 'CC13'], [n3, 'CC14'], [n4, 'CC15'], [n5, 'CC16'], [n6, 'CC17'], [n7, 'CC18']]) : null],
    [12, sign(n3) === '+' ? firstNeighbor(ctx, n3, '+', [[n4, 'CC20'], [n5, 'CC21'], [n6, 'CC22'], [n7, 'CC23']]) : null],
    [13, sign(n4) === '+' ? 'CC24' : null],
    [14, sign(n4) === '+' ? firstNeighbor(ctx, n4, '+', [[n5, 'CC25'], [n6, 'CC26'], [n7, 'CC27']]) : null],
    [15, sign(n5) === '+' ? 'CC28' : null],
    [16, sign(n5) === '+' ? firstNeighbor(ctx, n5, '+', [[n6, 'CC29'], [n7, 'CC30']]) : null],
    [17, sign(n6) === '+' && n6 === 1 ? 'CC31' : sign(n6) === '+' && sign(n7) === '+' ? 'CC33' : null],
    [18, sign(n7) === '+' && ((n7 < 8 && signs.charAt(n7) !== '+') || (n7 > 1 && sign(n7 - 1) !== '+')) ? 'CC32' : null],
    [19, 'CD00'],
    // Deliberate fix: legacy tests N6 twice here, so CD05 could never appear. The second test is
    // N7, as decided for the new version, so these cases no longer match legacy, which gave CD06.
    [21, perception(ctx, n0, [[n1, 'CD01'], [n2, 'CD02'], [n3, 'CD02'], [n4, 'CD02'], [n5, 'CD03'], [n6, 'CD04'], [n7, 'CD05']], 'CD06')],
    [23, perception(ctx, n1, [[n2, 'CD08'], [n3, 'CD09'], [n4, 'CD09'], [n5, 'CD10'], [n6, 'CD11'], [n7, 'CD12']], 'CD07')],
    [25, perception(ctx, n2, [[n3, 'CD14'], [n4, 'CD15'], [n5, 'CD16'], [n6, 'CD17'], [n7, 'CD18']], 'CD13')],
    [27, perception(ctx, n3, [[n4, 'CD20'], [n5, 'CD21'], [n6, 'CD22'], [n7, 'CD23']], 'CD19')],
    [29, perception(ctx, n4, [[n5, 'CD24'], [n6, 'CD25'], [n7, 'CD26']], 'CD24')],
    [31, perception(ctx, n5, [[n6, 'CD27'], [n7, 'CD28']], 'CD31')],
    [33, perception(ctx, n6, [[n7, 'CD29']], 'CD29')],
    [34, sign(n7) === 'X' && n7 === 4 && (sign(n7 + 1) !== 'X' || sign(n7 - 1) !== 'X') ? 'CD30' : null],
    [35, stability > 0 ? 'CE01' : stability === 0 ? 'CE02' : 'CE03'],
    [36, 'CF00'],
    [37, pronostico(ctx)],
    [38, prioridades(ctx)],
    [39, 'CJ00'],
    [40, evolucionPronostico(ctx)],
    [41, 'CL00'],
    [42, conclusionCode(conclusions, serie2)],
  ];

  return slots.flatMap(([slot, baseCode]) => (baseCode ? [{ slot, baseCode }] : []));
}
