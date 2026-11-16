import { describe, expect, it } from 'vitest';
import { demoOperatorPack } from '../../content/demo-content';
import { applyColor, newSession } from '../capture/build';
import { P4_TRAITS } from '../../domain/traits';
import { isCustom, isNameTaken, newCustomProfile, positionOf, profileName, rangeProblem, traitTop } from './profiles';

const pack = demoOperatorPack();
const factory = pack.profiles[1];
if (!factory) throw new Error('missing fixture');

describe('profileName', () => {
  it('joins the company and position, as legacy does', () => {
    expect(profileName('Acme', 'Auxiliar')).toBe('Acme/Auxiliar');
  });

  it('uses only the position with no company, and trims', () => {
    expect(profileName('  ', ' Auxiliar ')).toBe('Auxiliar');
  });
});

describe('traitTop', () => {
  it('is 150 for CI traits and 100 for the rest', () => {
    expect(traitTop(P4_TRAITS.ciGlobal)).toBe(150);
    expect(traitTop(P4_TRAITS.factorEspacial)).toBe(150);
    expect(traitTop(P4_TRAITS.actividad)).toBe(100);
    expect(traitTop('ce:13')).toBe(100);
  });
});

describe('rangeProblem', () => {
  const trait = P4_TRAITS.actividad;

  it.each([
    ['0', '100'],
    ['30', '70'],
    ['50', '50'],
  ])('accepts %s to %s', (min, max) => {
    expect(rangeProblem(trait, min, max)).toBeNull();
  });

  it.each([
    ['', '70'],
    ['abc', '70'],
    ['-1', '70'],
    ['1.5', '70'],
    ['30', '1000'],
  ])('rejects %s to %s as not a number', (min, max) => {
    expect(rangeProblem(trait, min, max)).toBe('not-a-number');
  });

  it('rejects a value above the top', () => {
    expect(rangeProblem(trait, '30', '101')).toBe('out-of-range');
  });

  it('allows up to 150 for a CI trait', () => {
    expect(rangeProblem(P4_TRAITS.ciGlobal, '90', '150')).toBeNull();
    expect(rangeProblem(P4_TRAITS.ciGlobal, '90', '151')).toBe('out-of-range');
  });

  it('rejects a minimum above the maximum', () => {
    expect(rangeProblem(trait, '71', '70')).toBe('minimum-above-maximum');
  });
});

describe('newCustomProfile', () => {
  const custom = newCustomProfile('c1', factory, ' Acme ', ' Auxiliar ');

  it('copies the ranges, without sharing them', () => {
    expect(custom.ranges).toEqual(factory.ranges);
    expect(custom.ranges).not.toBe(factory.ranges);
    expect(custom.ranges[P4_TRAITS.actividad]).not.toBe(factory.ranges[P4_TRAITS.actividad]);
  });

  it('is editable, and names itself from the company and position', () => {
    expect(custom).toMatchObject({ locked: false, hasRanges: true, name: 'Acme/Auxiliar', company: 'Acme', position: 'Auxiliar', modules: ['p4', 'ce'] });
  });

  it('remembers the factory profile whose texts it uses', () => {
    expect(custom.textProfileId).toBe(factory.id);
  });

  it('keeps the original text source when copying a copy', () => {
    expect(newCustomProfile('c2', custom, '', 'Otro').textProfileId).toBe(factory.id);
  });

  it('has ranges even when copied from a profile without them', () => {
    const none = pack.profiles[0];
    if (!none) throw new Error('missing fixture');
    expect(none.hasRanges).toBe(false);
    expect(newCustomProfile('c3', none, '', 'Otro').hasRanges).toBe(true);
  });
});

describe('helpers', () => {
  const custom = newCustomProfile('c1', factory, 'Acme', 'Auxiliar');

  it('tells custom profiles apart', () => {
    expect(isCustom(custom)).toBe(true);
    expect(isCustom(factory)).toBe(false);
  });

  it('gives the position for reports', () => {
    expect(positionOf(custom)).toBe('Auxiliar');
    expect(positionOf(factory)).toBe(factory.name);
  });

  it('finds a taken name, ignoring accents and case', () => {
    const named = { ...custom, name: 'Acme/Áuxiliar' };
    expect(isNameTaken('acme/auxiliar', [named])).toBe(true);
    expect(isNameTaken('otra', [named])).toBe(false);
  });

  it('ignores the profile being renamed', () => {
    expect(isNameTaken('Acme/Auxiliar', [custom], custom.id)).toBe(false);
  });
});

describe('sessions with a custom profile', () => {
  const session = (custom: ReturnType<typeof newCustomProfile>) =>
    newSession(pack, { id: 's1', examineeId: 'e1', birthDate: '1990-06-15', testDate: '2020-06-15', maritalStatus: null, profileId: custom.id }, [custom]);

  it('snapshots its ranges, the position and its text source', () => {
    const custom = newCustomProfile('c1', factory, 'Acme', 'Auxiliar');
    custom.ranges[P4_TRAITS.actividad] = { min: 11, max: 22 };
    const s = session(custom);
    expect(s.profile).toMatchObject({ id: 'c1', name: 'Auxiliar', hasRanges: true, textProfileId: factory.id });
    expect(s.profile.ranges[P4_TRAITS.actividad]).toEqual({ min: 11, max: 22 });
  });

  it('is not changed by later edits to the profile', () => {
    const custom = newCustomProfile('c1', factory, 'Acme', 'Auxiliar');
    const s = session(custom);
    custom.ranges[P4_TRAITS.actividad] = { min: 1, max: 2 };
    expect(s.profile.ranges[P4_TRAITS.actividad]).toEqual({ min: 30, max: 70 });
  });

  it('leaves the text source out for a factory profile', () => {
    const s = newSession(pack, { id: 's1', examineeId: 'e1', birthDate: '1990-06-15', testDate: '2020-06-15', maritalStatus: null, profileId: factory.id });
    expect('textProfileId' in s.profile).toBe(false);
  });

  it('picks texts from the table of the factory profile it came from', () => {
    const varied = demoOperatorPack();
    const table = varied.traitTextTables.find((t) => t.traitId === P4_TRAITS.actividad);
    const text = varied.texts.find((t) => t.id === table?.bands[0]?.textIds[0]);
    const other = varied.texts.find((t) => t.id === table?.bands[1]?.textIds[0]);
    if (!table || !text || !other) throw new Error('missing fixture');
    const bandsFor = (id: string) => [{ min: 0, max: 100, textIds: [id] }];
    varied.traitTextTables = [
      ...varied.traitTextTables.filter((t) => t.traitId !== P4_TRAITS.actividad),
      { traitId: P4_TRAITS.actividad, profileIds: ['factory:1'], bands: bandsFor(other.id) },
      { traitId: P4_TRAITS.actividad, profileIds: [factory.id], bands: bandsFor(text.id) },
    ];
    const custom = newCustomProfile('c1', factory, 'Acme', 'Auxiliar');
    const s = newSession(varied, { id: 's1', examineeId: 'e1', birthDate: '1990-06-15', testDate: '2020-06-15', maritalStatus: null, profileId: custom.id }, [custom]);
    const scores = applyColor(varied, { session: s }, '01234567', '32165470').scores;
    expect(scores?.find((score) => score.traitId === P4_TRAITS.actividad)?.textId).toBe(text.id);
  });
});
