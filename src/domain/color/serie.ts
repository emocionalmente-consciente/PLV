// Legacy `ValidaSerie` (DirectaCE.pas:418), without the dialogs: it finds the first wrong character
// in what has been typed so far, so a screen can react on each keystroke.

export type SerieProblem = { kind: 'not-a-digit'; position: number } | { kind: 'repeated'; position: number; digit: string };

export function serieProblem(text: string): SerieProblem | null {
  const seen = new Set<string>();
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    if (!/^[0-7]$/.test(char)) return { kind: 'not-a-digit', position: i + 1 };
    if (seen.has(char)) return { kind: 'repeated', position: i + 1, digit: char };
    seen.add(char);
  }
  return null;
}

/** Complete and valid: all eight digits, each once. */
export const isCompleteSerie = (text: string): boolean => text.length === 8 && serieProblem(text) === null;
