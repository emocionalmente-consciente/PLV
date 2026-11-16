import { describe, expect, it } from 'vitest';
import { demoOperatorPack } from '../../content/demo-content';
import { CE_TRAITS, P4_TRAITS } from '../../domain/traits';
import { type CeOption, applyCe, applyCi, applyColor, ciAgeAllowed, ciTotals, maritalOptions, newSession, pendingInstruments, testDateProblem } from './build';

const pack = demoOperatorPack();
const session = (over: { birthDate?: string; testDate?: string } = {}) =>
  newSession(pack, {
    id: 'sesion-1',
    examineeId: 'persona-1',
    birthDate: over.birthDate ?? '1990-06-15',
    testDate: over.testDate ?? '2020-06-15',
    maritalStatus: 'SOLTERA',
    profileId: 'factory:2',
  });

const byTrait = (scores: { traitId: string; value: number }[] = []): Record<string, number> => Object.fromEntries(scores.map((s) => [s.traitId, s.value]));

const FIRST = '01234567';
const SECOND = '32165470';

describe('maritalOptions', () => {
  it('follows the examinee\'s sex, as in legacy', () => {
    expect(maritalOptions('F')).toContain('SOLTERA');
    expect(maritalOptions('M')).toContain('SOLTERO');
    expect(maritalOptions('M')).not.toContain('SOLTERA');
  });
});

describe('testDateProblem', () => {
  it.each([
    ['2020-01-01', null],
    ['2026-11-06', null],
    ['2026-11-07', 'in-the-future'],
    ['1980-01-01', 'before-birth'],
    ['2020-02-30', 'invalid'],
    ['', 'invalid'],
  ])('%s gives %s', (date, expected) => {
    expect(testDateProblem(date, '1990-06-15', '2026-11-06')).toBe(expected);
  });
});

describe('newSession', () => {
  it('freezes the age at the test date, not today', () => {
    expect(session().ageAtTest).toBe(30);
    expect(session({ testDate: '2020-06-14' }).ageAtTest).toBe(29);
  });

  it('keeps its own copy of the profile', () => {
    const s = session();
    expect(s.profile).toMatchObject({ id: 'factory:2', name: 'Puesto de demostración', hasRanges: true });
    expect(s.profile.ranges[P4_TRAITS.actividad]).toEqual({ min: 30, max: 70 });
  });

  it('records versions, and uses the session ID as the text seed', () => {
    const s = session();
    expect(s.contentVersion).toBe('demo-1');
    expect(s.engineVersion).toBe('1');
    expect(s.textSeed).toBe('sesion-1');
    expect(s.administration).toBe('paper');
    expect(s.instruments).toEqual({ color: false, ci: false, ce: false });
  });

  it('uses LatAm by default, and stores the chosen norm profile', () => {
    expect(session().normProfileId).toBe('latam');
    const chosen = newSession(pack, { id: 'a', examineeId: 'b', birthDate: '1990-01-01', testDate: '2020-01-01', maritalStatus: null, profileId: 'factory:2', normProfileId: 'europa-luscher' });
    expect(chosen.normProfileId).toBe('europa-luscher');
  });

  it('throws for an unknown profile', () => {
    expect(() => newSession(pack, { id: 'a', examineeId: 'b', birthDate: '1990-01-01', testDate: '2020-01-01', maritalStatus: null, profileId: 'nada' })).toThrow(RangeError);
  });
});

describe('pendingInstruments', () => {
  const withFlags = (color: boolean, ci: boolean, ce: boolean) => ({ ...session(), instruments: { color, ci, ce } });

  it.each([
    [false, false, false, ['color', 'ci', 'ce']],
    [true, false, false, ['ci']],
    [false, true, false, ['color']],
    [true, true, false, []],
    [false, false, true, []],
  ])('color %s, CI %s, CE %s', (color, ci, ce, expected) => {
    expect(pendingInstruments(withFlags(color, ci, ce))).toEqual(expected);
  });
});

describe('ciAgeAllowed', () => {
  it.each([
    [17, false],
    [18, true],
    [150, true],
    [151, false],
  ])('age %i gives %s', (age, expected) => {
    expect(ciAgeAllowed(pack, age)).toBe(expected);
  });
});

describe('applyColor', () => {
  const record = applyColor(pack, { session: session() }, FIRST, SECOND);

  it('marks the instrument and stores the protocol', () => {
    expect(record.session.instruments.color).toBe(true);
    expect(record.colorResult?.protocol.serie2.signs).toBe('++X==___');
  });

  it('saves the 14 P4 traits, with the values traced by hand in Phase 3', () => {
    expect(record.scores).toHaveLength(14);
    expect(byTrait(record.scores)).toMatchObject({ [P4_TRAITS.autodominio]: 50, [P4_TRAITS.ceGlobal]: 51, [P4_TRAITS.liderazgo]: 85 });
  });

  it('chooses a text for each qualitative slot', () => {
    const slots = record.colorResult?.qualitative ?? [];
    expect(slots.map((s) => s.baseCode)).toContain('CC12');
    const textIds = new Set(pack.texts.map((t) => t.id));
    expect(slots.every((s) => textIds.has(s.textId))).toBe(true);
  });

  it('chooses a text by score band', () => {
    const score = record.scores?.find((s) => s.traitId === P4_TRAITS.liderazgo);
    const table = pack.traitTextTables.find((t) => t.traitId === P4_TRAITS.liderazgo);
    expect(table?.bands[1]?.textIds).toContain(score?.textId);
  });

  it('gives the same texts when rescored, because the seed is stored', () => {
    expect(applyColor(pack, { session: session() }, FIRST, SECOND)).toEqual(record);
  });

  it('can give different texts in another session', () => {
    const chosen = new Set(
      Array.from({ length: 12 }, (_, i) => {
        const s = { ...session(), id: `s-${String(i)}`, textSeed: `s-${String(i)}` };
        return JSON.stringify(applyColor(pack, { session: s }, FIRST, SECOND).colorResult?.qualitative.map((q) => q.textId));
      }),
    );
    expect(chosen.size).toBeGreaterThan(1);
  });
});

describe('applyCi', () => {
  const firstOf = (factor: string, count: number): string[] => pack.ci.key.filter((k) => k.factor === factor).slice(0, count).map((k) => k.itemId);
  const checked = new Set([...firstOf('verbal', 10), ...firstOf('numeric', 8), ...firstOf('spatial', 6)]);

  it('counts ticks by factor', () => {
    expect(ciTotals(pack, checked)).toEqual({ verbal: 10, numeric: 8, spatial: 6 });
  });

  it('scores from the norm table, with factors at raw times 3 and global at the sum', () => {
    const scores = byTrait(applyCi(pack, { session: session() }, checked).scores);
    // The demo's band for ages 18-30 is 50 + raw * 2, and the age is 30.
    expect(scores).toEqual({
      [P4_TRAITS.ciGlobal]: 50 + 24 * 2,
      [P4_TRAITS.factorVerbal]: 50 + 30 * 2,
      [P4_TRAITS.factorNumerico]: 50 + 24 * 2,
      [P4_TRAITS.factorEspacial]: 50 + 18 * 2,
    });
  });

  it('saves a row for all 36 items, with a tick as 1 point and no entered answer', () => {
    const answers = applyCi(pack, { session: session() }, checked).itemAnswers ?? [];
    expect(answers).toHaveLength(36);
    expect(answers.filter((a) => a.correct).length).toBe(24);
    expect(answers.every((a) => a.given === null && a.points === (a.correct ? 1 : 0))).toBe(true);
  });

  it('allows all factors at zero', () => {
    const scores = byTrait(applyCi(pack, { session: session() }, new Set()).scores);
    expect(scores[P4_TRAITS.ciGlobal]).toBe(50);
  });

  it('gives CI scores no text', () => {
    expect(applyCi(pack, { session: session() }, checked).scores?.every((s) => s.textId === null)).toBe(true);
  });

  it('refuses an age the norms do not cover', () => {
    expect(() => applyCi(pack, { session: session({ testDate: '2005-01-01' }) }, checked)).toThrow();
  });

  it('keeps Color scores when CI follows Color, and the reverse', () => {
    const colorFirst = applyCi(pack, applyColor(pack, { session: session() }, FIRST, SECOND), checked);
    expect(colorFirst.scores).toHaveLength(18);
    expect(colorFirst.session.instruments).toEqual({ color: true, ci: true, ce: false });
    const ciFirst = applyColor(pack, applyCi(pack, { session: session() }, checked), FIRST, SECOND);
    expect(ciFirst.scores).toHaveLength(18);
    expect(byTrait(ciFirst.scores)).toEqual(byTrait(colorFirst.scores));
  });
});

describe('applyCe', () => {
  const allA = (): Record<string, CeOption> => Object.fromEntries(pack.ce.items.map((item) => [item.id, 'A' as const]));

  it('saves the 15 CE traits, with values traced by hand', () => {
    const scores = byTrait(applyCe(pack, { session: session() }, FIRST, SECOND, allA()).scores);
    expect(Object.keys(scores)).toHaveLength(15);
    // Each factor has 5 items at 2 points, so raw 10 adds 30 or 40 to the hand-traced bases.
    expect(scores).toMatchObject({
      [CE_TRAITS.catalizadorCambios]: 90,
      [CE_TRAITS.consideracionDemas]: 75,
      [CE_TRAITS.influencia]: 100,
      [CE_TRAITS.dominioEmpuje]: 100,
      [CE_TRAITS.lealtadGrupal]: 90,
      [CE_TRAITS.comunicacion]: 85,
      [CE_TRAITS.ceInterpersonal]: 90,
      [CE_TRAITS.ceIntrapersonal]: 58,
      [CE_TRAITS.factorGEmocional]: 74,
    });
  });

  it('freezes the answer and its points', () => {
    const answers = applyCe(pack, { session: session() }, FIRST, SECOND, allA()).itemAnswers ?? [];
    expect(answers).toHaveLength(30);
    expect(answers[0]).toEqual({ sessionId: 'sesion-1', itemId: 'ce:1', given: 'A', correct: null, points: 2 });
  });

  it('has a protocol but no qualitative texts, as in legacy', () => {
    const record = applyCe(pack, { session: session() }, FIRST, SECOND, allA());
    expect(record.colorResult?.protocol.serie1.signs).toBe('+XX====_');
    expect(record.colorResult?.qualitative).toEqual([]);
    expect(record.session.instruments).toEqual({ color: false, ci: false, ce: true });
  });

  it('refuses a missing answer', () => {
    const options = allA();
    delete options['ce:7'];
    expect(() => applyCe(pack, { session: session() }, FIRST, SECOND, options)).toThrow(RangeError);
  });
});
