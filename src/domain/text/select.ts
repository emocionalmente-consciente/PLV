// Text selection. Legacy picks at random: one range never reaches the last option, and another can
// read index 0 of a 1-based array. Here the choice is seeded by the session, so rescoring gives
// the same text, and every option can be chosen.
import type { QualitativeSlot } from '../color/qualitative';

export interface TextBand {
  min: number;
  max: number;
  textIds: string[];
}

/** Texts for a score. Bands are inclusive and may overlap, so all matches are collected in order. */
export function textIdsForScore(bands: readonly TextBand[], score: number): string[] {
  return bands.filter((b) => score >= b.min && score <= b.max).flatMap((b) => b.textIds);
}

/** FNV-1a, 32-bit: small and stable, and this choice needs no cryptographic strength. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Chooses one option for a seed and a key, such as a trait ID or slot. Null when there are none. */
export function pickText(options: readonly string[], seed: string, key: string): string | null {
  if (options.length === 0) return null;
  return options[hash(`${seed}|${key}`) % options.length] ?? null;
}

export interface SelectedText {
  slot: number;
  baseCode: string;
  textId: string;
}

/** Chooses a variant for each slot. Throws for a base code with no text, which the pack build should prevent. */
export function selectQualitativeTexts(
  slots: readonly QualitativeSlot[],
  variantsByBaseCode: Readonly<Record<string, readonly string[]>>,
  seed: string,
): SelectedText[] {
  return slots.map(({ slot, baseCode }) => {
    const textId = pickText(variantsByBaseCode[baseCode] ?? [], seed, `slot:${String(slot)}`);
    if (textId === null) throw new RangeError(`No text for base code ${baseCode}`);
    return { slot, baseCode, textId };
  });
}
