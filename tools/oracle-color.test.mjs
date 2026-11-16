// Compares the color protocol with stored legacy outputs. Skips when the private oracle is
// missing, as in CI. Mismatches go to the private folder, so test output shows counts only.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeProtocol } from '../src/domain/color/protocol';

const ORACLE = join(homedir(), 'psiv-private', 'oracle');
const CASES = join(ORACLE, 'color.json');

describe.skipIf(!existsSync(CASES))('legacy color oracle', () => {
  it('matches every stored protocol', () => {
    const cases = JSON.parse(readFileSync(CASES, 'utf8'));
    const mismatches = [];
    for (const { serie1, serie2, expected } of cases) {
      const actual = computeProtocol(serie1, serie2);
      const fields = [];
      for (const serie of ['serie1', 'serie2']) {
        for (const field of ['signs', 'marks', 'letters']) {
          // The legacy database doesn't keep trailing spaces, so compare without them.
          if (actual[serie][field].trimEnd() !== expected[serie][field].trimEnd()) fields.push(`${serie}.${field}`);
        }
      }
      if (fields.length > 0) mismatches.push({ serie1, serie2, fields, expected, actual });
    }
    writeFileSync(join(ORACLE, 'color-mismatches.json'), `${JSON.stringify(mismatches, null, 1)}\n`, { mode: 0o600 });
    expect(cases.length).toBeGreaterThan(0);
    expect(mismatches.length).toBe(0);
  });
});
