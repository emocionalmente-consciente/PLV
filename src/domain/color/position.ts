// Pascal strings are 1-based. The protocol code keeps legacy positions so it can be
// compared line by line with UAlgoritColor.pas, and these helpers do the conversion.
// Unlike unchecked Delphi strings, they throw on a position outside the string.

function assertInRange(text: string, position: number): void {
  if (!Number.isInteger(position) || position < 1 || position > text.length) {
    throw new RangeError(`Position ${String(position)} is outside a string of length ${String(text.length)}`);
  }
}

/** Pascal `text[position]`. */
export function charAt1(text: string, position: number): string {
  assertInRange(text, position);
  return text.charAt(position - 1);
}

/**
 * Pascal `text[position]` where the legacy code may read one place past the end. Delphi
 * returns the string's #0 terminator there, which never equals a sign or a digit.
 */
export function charOrEnd1(text: string, position: number): string {
  return position === text.length + 1 ? '\0' : charAt1(text, position);
}

/** Pascal `table[position]` for an `array [1..n]`. */
export function tableAt1(table: readonly number[], position: number): number {
  const value = table[position - 1];
  if (value === undefined) {
    throw new RangeError(`Position ${String(position)} is outside a table of length ${String(table.length)}`);
  }
  return value;
}

/** Pascal `text[position] := char`, returning the new string. */
export function setChar1(text: string, position: number, char: string): string {
  assertInRange(text, position);
  return text.slice(0, position - 1) + char + text.slice(position);
}

/** Pascal `Pos(needle, text)`: the 1-based position of the first match, or 0. */
export function pos1(needle: string, text: string): number {
  return text.indexOf(needle) + 1;
}

/** Legacy `UltPos(char, text)`: the 1-based position of the last match, or 0. */
export function lastPos1(char: string, text: string): number {
  return text.lastIndexOf(char) + 1;
}
