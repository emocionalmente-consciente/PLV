// Compares trait scoring and the qualitative selector with stored legacy results. Skips when the
// private oracle is missing, as in CI. Details go to the private folder, and test output shows
// counts only.
//
// The newest rows must match exactly. Older rows differ in patterns that point to earlier builds
// (DATA_MODEL.md, Phase 3), so they have a fixed count of known differences. That way a change
// that breaks more of them still fails.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scoreCe } from '../src/domain/ce/score';
import { scoreCi } from '../src/domain/ci/score';
import { scoreP4 } from '../src/domain/color/p4';
import { computeQualitative } from '../src/domain/color/qualitative';

const ORACLE = join(homedir(), 'psiv-private', 'oracle');
const load = (name) => JSON.parse(readFileSync(join(ORACLE, name), 'utf8'));
const available = existsSync(join(ORACLE, 'p4.json'));

// New sessions follow the written conditions for these CE rules, as decided after review, so they
// no longer match legacy. Factor G and C.E. Intrapersonal are built on them.
const CE_CHANGED_BY_DECISION = new Set(['ce:15', 'ce:17', 'ce:18', 'ce:25', 'ce:27']);

const KNOWN_DIFFERENCES = {
  p4Older: 88,
  qualitativeOlder: 85,
  ciKnownAge: 4,
  ciAnyBand: 2,
};

function scoreMismatches(cases, score) {
  const mismatches = [];
  for (const c of cases) {
    const actual = Object.fromEntries(score(c).map((s) => [s.traitId, s.value]));
    const traits = Object.keys(c.expected).filter((t) => actual[t] !== c.expected[t]);
    if (traits.length > 0) mismatches.push({ ...c, actual, traits });
  }
  return mismatches;
}

function report(name, total, mismatches) {
  writeFileSync(join(ORACLE, `${name}-mismatches.json`), `${JSON.stringify(mismatches, null, 1)}\n`, { mode: 0o600 });
  writeFileSync(join(ORACLE, `${name}-summary.txt`), `${total - mismatches.length}/${total} match\n`, { mode: 0o600 });
}

function qualitativeMismatches(cases, conclusions) {
  const mismatches = [];
  let fixedCd05 = 0;
  for (const c of cases) {
    const actual = Object.fromEntries(computeQualitative(c.serie1, c.serie2, conclusions).map((s) => [s.slot, s.baseCode]));
    const wrong = [];
    for (let n = 1; n <= 42; n++) {
      // Deliberate fix: the new version gives CD05 where legacy's duplicated test fell through to CD06.
      if (n === 21 && actual[n] === 'CD05' && c.slots[n] === 'CD06') {
        fixedCd05++;
        continue;
      }
      if (c.slots[n] !== '?' && (actual[n] ?? null) !== c.slots[n]) wrong.push(n);
    }
    if (wrong.length > 0) mismatches.push({ ...c, actual, wrong });
  }
  writeFileSync(join(ORACLE, `qualitative-cd05-${cases[0]?.recent ? 'recent' : 'older'}.txt`), `${fixedCd05} cases changed by the CD05 fix\n`, { mode: 0o600 });
  return mismatches;
}

describe.skipIf(!available)('legacy scoring oracle', () => {
  it('P4 traits match every newest row', () => {
    const cases = load('p4.json').filter((c) => c.recent);
    const mismatches = scoreMismatches(cases, (c) => scoreP4(c.serie1, c.serie2));
    report('p4-recent', cases.length, mismatches);
    expect(cases.length).toBeGreaterThan(0);
    expect(mismatches.length).toBe(0);
  });

  it('P4 traits on older rows have no new differences', () => {
    const cases = load('p4.json').filter((c) => !c.recent);
    const mismatches = scoreMismatches(cases, (c) => scoreP4(c.serie1, c.serie2));
    report('p4-older', cases.length, mismatches);
    expect(mismatches.length).toBeLessThanOrEqual(KNOWN_DIFFERENCES.p4Older);
  });

  it('CE traits not changed by the decision match', () => {
    const cases = load('ce.json').map((c) => ({
      ...c,
      expected: Object.fromEntries(Object.entries(c.expected).filter(([t]) => !CE_CHANGED_BY_DECISION.has(t))),
    }));
    const mismatches = scoreMismatches(cases, (c) => scoreCe(c.serie1, c.serie2, c.raw));
    report('ce', cases.length, mismatches);
    expect(cases.length).toBeGreaterThan(0);
    expect(mismatches.length).toBe(0);
  });

  it('CI scores where the age is known have no new differences', () => {
    const norms = load('ci-norms.json');
    const cases = load('ci.json').filter((c) => c.age !== null && c.age >= 18 && c.age <= 150);
    const mismatches = scoreMismatches(cases, (c) => scoreCi(c.raw, c.age, norms).scores);
    report('ci', cases.length, mismatches);
    expect(cases.length).toBeGreaterThan(0);
    expect(mismatches.length).toBeLessThanOrEqual(KNOWN_DIFFERENCES.ciKnownAge);
  });

  it('CI scores where the age is unknown fit one age band', () => {
    const norms = load('ci-norms.json');
    const cases = load('ci.json').filter((c) => c.age === null || c.age < 18 || c.age > 150);
    const ages = norms.bands.map((b) => b.minAge);
    const fits = (c) =>
      ages.some((age) => {
        const actual = Object.fromEntries(scoreCi(c.raw, age, norms).scores.map((s) => [s.traitId, s.value]));
        return Object.keys(c.expected).every((t) => actual[t] === c.expected[t]);
      });
    const mismatches = cases.filter((c) => !fits(c));
    report('ci-any-band', cases.length, mismatches);
    expect(mismatches.length).toBeLessThanOrEqual(KNOWN_DIFFERENCES.ciAnyBand);
  });

  it('qualitative base codes match every newest row', () => {
    const cases = load('qualitative.json').filter((c) => c.recent);
    const mismatches = qualitativeMismatches(cases, load('conclusions.json'));
    report('qualitative-recent', cases.length, mismatches);
    expect(cases.length).toBeGreaterThan(0);
    expect(mismatches.length).toBe(0);
  });

  it('qualitative base codes on older rows have no new differences', () => {
    const cases = load('qualitative.json').filter((c) => !c.recent);
    const mismatches = qualitativeMismatches(cases, load('conclusions.json'));
    report('qualitative-older', cases.length, mismatches);
    expect(mismatches.length).toBeLessThanOrEqual(KNOWN_DIFFERENCES.qualitativeOlder);
  });
});
