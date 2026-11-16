// CI scoring, ported from UAlgoritCoefInt.pas and CalifNivel in VerInformeG32.pas.
import { P4_TRAITS, type TraitScore } from '../traits';

/** The CI norm table from the content pack (DATA_MODEL.md, `CiNorms`). */
export interface CiNorms {
  bands: { id: string; minAge: number; maxAge: number }[];
  /** Band ID to the norm score for each raw value, by index. */
  table: Record<string, number[]>;
}

/** Sum of the points in each factor. */
export interface CiRawScores {
  verbal: number;
  numeric: number;
  spatial: number;
}

export interface CiResult {
  rawTotal: number;
  global: number;
  verbal: number;
  numeric: number;
  spatial: number;
  /** Level for each score, from 1 to 9. See `ciLevel`. */
  levels: { global: CiLevel | null; verbal: CiLevel | null; numeric: CiLevel | null; spatial: CiLevel | null };
  scores: TraitScore[];
}

export type CiLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export class CiValidationError extends Error {
  constructor(
    readonly code: 'age-out-of-range' | 'norm-missing',
    message: string,
  ) {
    super(message);
    this.name = 'CiValidationError';
  }
}

const LEVEL_UPPER_BOUNDS = [29, 49, 69, 79, 89, 109, 119, 129, 250];

/**
 * `CalifNivel` as a number from 1 to 9, or null outside 0 to 250. The legacy labels are dated
 * and stigmatizing, and the plan requires a wording review, so Phase 7 will map these numbers
 * to the reviewed wording.
 */
export function ciLevel(value: number): CiLevel | null {
  if (!Number.isInteger(value) || value < 0 || value > 250) return null;
  return (LEVEL_UPPER_BOUNDS.findIndex((upper) => value <= upper) + 1) as CiLevel;
}

function lookUp(table: readonly number[], raw: number): number {
  const value = table[raw];
  if (value === undefined) {
    throw new CiValidationError('norm-missing', `No hay baremo para la puntuación ${String(raw)}.`);
  }
  return value;
}

/**
 * Legacy `ArmaBaremoCI`. Each factor looks up its raw score times 3, and the global score looks
 * up the plain sum. Legacy returned an undefined result for an age outside every band or a
 * missing norm row, and this throws a clear error instead.
 */
export function scoreCi(raw: CiRawScores, age: number, norms: CiNorms): CiResult {
  const band = norms.bands.find((b) => age >= b.minAge && age <= b.maxAge);
  if (!band) {
    throw new CiValidationError('age-out-of-range', `No se puede calificar el C.I. con una edad de ${String(age)} años.`);
  }
  const table = norms.table[band.id];
  if (!table) {
    throw new CiValidationError('norm-missing', `No hay baremo para el grupo ${band.id}.`);
  }
  const rawTotal = raw.verbal + raw.numeric + raw.spatial;
  const verbal = lookUp(table, raw.verbal * 3);
  const numeric = lookUp(table, raw.numeric * 3);
  const spatial = lookUp(table, raw.spatial * 3);
  const global = lookUp(table, rawTotal);
  const T = P4_TRAITS;
  return {
    rawTotal,
    global,
    verbal,
    numeric,
    spatial,
    levels: { global: ciLevel(global), verbal: ciLevel(verbal), numeric: ciLevel(numeric), spatial: ciLevel(spatial) },
    scores: [
      { traitId: T.ciGlobal, value: global },
      { traitId: T.factorVerbal, value: verbal },
      { traitId: T.factorNumerico, value: numeric },
      { traitId: T.factorEspacial, value: spatial },
    ],
  };
}
