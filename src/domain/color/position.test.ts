import { describe, expect, it } from 'vitest';
import { charAt1, charOrEnd1, lastPos1, pos1, setChar1, tableAt1 } from './position';

describe('charOrEnd1', () => {
  it('reads like charAt1 inside the string', () => {
    expect(charOrEnd1('abc', 3)).toBe('c');
  });

  it('returns the #0 terminator one place past the end, as Delphi does', () => {
    expect(charOrEnd1('abc', 4)).toBe('\0');
  });

  it('throws further past the end', () => {
    expect(() => charOrEnd1('abc', 5)).toThrow(RangeError);
  });
});

describe('tableAt1', () => {
  it('reads 1-based positions', () => {
    expect(tableAt1([10, 20], 1)).toBe(10);
    expect(tableAt1([10, 20], 2)).toBe(20);
  });

  it.each([0, 3])('throws at position %i', (position) => {
    expect(() => tableAt1([10, 20], position)).toThrow(RangeError);
  });
});

describe('charAt1', () => {
  it('reads 1-based positions', () => {
    expect(charAt1('abc', 1)).toBe('a');
    expect(charAt1('abc', 3)).toBe('c');
  });

  it.each([0, 4, -1, 1.5])('throws at position %s', (position) => {
    expect(() => charAt1('abc', position)).toThrow(RangeError);
  });
});

describe('setChar1', () => {
  it('replaces 1-based positions and returns a new string', () => {
    expect(setChar1('abc', 1, 'x')).toBe('xbc');
    expect(setChar1('abc', 3, 'x')).toBe('abx');
  });

  it.each([0, 4])('throws at position %s', (position) => {
    expect(() => setChar1('abc', position, 'x')).toThrow(RangeError);
  });
});

describe('pos1 and lastPos1', () => {
  it('finds the first and last match', () => {
    expect(pos1('b', 'abcb')).toBe(2);
    expect(lastPos1('b', 'abcb')).toBe(4);
    expect(pos1('bc', 'abcb')).toBe(2);
  });

  it('returns 0 for no match', () => {
    expect(pos1('z', 'abc')).toBe(0);
    expect(lastPos1('z', 'abc')).toBe(0);
  });
});
