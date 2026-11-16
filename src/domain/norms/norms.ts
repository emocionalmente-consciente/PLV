// What a norm profile adds to a report. Color scoring reads no population norms, so a profile never
// changes a score: it changes only the reference table and which interpretive notes apply.
import { pos1 } from '../color/position';

export interface InterpretiveNote {
  id: string;
  digit: string;
  /** The places in Serie 2, from 1 to 8, where the note applies. */
  positions: number[];
  text: string;
  source: string;
}

export interface NormProfile {
  id: string;
  name: string;
  /** Printed on reports, so that a reader knows which reference was used. */
  label: string;
  /** First-choice percentage for each color digit. */
  colorReference: Record<string, number>;
  colorOrder: string;
  interpretiveNotes: InterpretiveNote[];
  status: 'validated' | 'reference-only';
}

export const COLOR_NAMES: Record<string, string> = { '0': 'Gris', '1': 'Azul', '2': 'Verde', '3': 'Rojo', '4': 'Amarillo', '5': 'Violeta', '6': 'Marrón', '7': 'Negro' };

export interface ReferenceRow {
  digit: string;
  name: string;
  percent: number;
  /** Place in the reference order, from 1 to 8. */
  referenceOrder: number;
  /** Place the examinee gave this color in Serie 2, from 1 to 8. */
  examineePosition: number;
}

/** One row per color, in the reference order. Only Serie 2 is used, as with the trait rules. */
export function colorReferenceRows(profile: NormProfile, serie2: string): ReferenceRow[] {
  return [...profile.colorOrder].map((digit, index) => ({
    digit,
    name: COLOR_NAMES[digit] ?? digit,
    percent: profile.colorReference[digit] ?? 0,
    referenceOrder: index + 1,
    examineePosition: pos1(digit, serie2),
  }));
}

/** The notes that apply to this examinee's Serie 2. */
export function applicableNotes(profile: NormProfile, serie2: string): InterpretiveNote[] {
  return profile.interpretiveNotes.filter((note) => note.positions.includes(pos1(note.digit, serie2)));
}
