import { describe, expect, it } from 'vitest';
import { checkOperatorPack, normProfileProblems } from '../../content/checks';
import { demoOperatorPack } from '../../content/demo-content';
import { applicableNotes, colorReferenceRows } from './norms';

const pack = demoOperatorPack();
const latam = pack.normProfiles.find((p) => p.id === 'latam');
const europa = pack.normProfiles.find((p) => p.id === 'europa-luscher');
if (!latam || !europa) throw new Error('missing fixture');

describe('colorReferenceRows', () => {
  const rows = colorReferenceRows(latam, '32165470');

  it('has one row per color, in the reference order', () => {
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.digit).join('')).toBe(latam.colorOrder);
    expect(rows.map((r) => r.referenceOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('gives the place from Serie 2', () => {
    expect(rows.find((r) => r.digit === '3')?.examineePosition).toBe(1);
    expect(rows.find((r) => r.digit === '0')?.examineePosition).toBe(8);
  });

  it('names each color and gives its percentage', () => {
    expect(rows.find((r) => r.digit === '1')).toMatchObject({ name: 'Azul', percent: latam.colorReference['1'] });
  });

  it('differs between profiles for the same series', () => {
    expect(colorReferenceRows(europa, '32165470').map((r) => r.percent)).not.toEqual(rows.map((r) => r.percent));
  });
});

describe('applicableNotes', () => {
  it.each([
    ['32045167', 6, true],
    ['32041567', 5, true],
    ['32014567', 4, false],
    ['32045617', 7, false],
  ])('Azul in %s, at place %i, gives the note: %s', (serie, _place, expected) => {
    expect(applicableNotes(latam, serie).some((n) => n.digit === '1')).toBe(expected);
  });

  it('has no México-only notes under Europa', () => {
    expect(applicableNotes(europa, '32045167')).toEqual([]);
  });
});

describe('normProfileProblems', () => {
  const at = (p: ReturnType<typeof demoOperatorPack>, index: number) => {
    const profile = p.normProfiles[index];
    if (!profile) throw new Error('missing fixture');
    return profile;
  };

  const problems = (change: (pack: ReturnType<typeof demoOperatorPack>) => void): string[] => {
    const copy = demoOperatorPack();
    change(copy);
    return normProfileProblems(copy.normProfiles);
  };

  it('accepts the demo profiles, also through the full pack checks', () => {
    expect(normProfileProblems(pack.normProfiles)).toEqual([]);
    expect(checkOperatorPack(pack)).toEqual([]);
  });

  it('needs both profiles', () => {
    expect(problems((p) => void p.normProfiles.pop())).toContain('Norm profile europa-luscher is missing');
  });

  it('needs percentages that sum to 100', () => {
    expect(problems((p) => void (at(p, 0).colorReference['0'] = 50))).not.toEqual([]);
  });

  it('needs an order that matches the percentages', () => {
    expect(problems((p) => void (at(p, 0).colorOrder = '01234567'))).toContain("latam: colorOrder doesn't follow the percentages");
  });

  it('needs a valid order', () => {
    expect(problems((p) => void (at(p, 0).colorOrder = '00000000'))).toContain('latam: colorOrder is not a permutation');
  });

  it('rejects a note on a color or place that does not exist', () => {
    expect(problems((p) => void at(p, 0).interpretiveNotes.push({ id: 'x', digit: '9', positions: [1], text: 'a', source: 'b' }))).not.toEqual([]);
    expect(problems((p) => void at(p, 0).interpretiveNotes.push({ id: 'x', digit: '1', positions: [9], text: 'a', source: 'b' }))).not.toEqual([]);
  });

  it('rejects México-only notes under Europa, and any claim that Europa is validated', () => {
    expect(problems((p) => void at(p, 1).interpretiveNotes.push({ id: 'x', digit: '1', positions: [5], text: 'a', source: 'b' }))).toContain('europa-luscher: must have no México-only notes');
    expect(problems((p) => void (at(p, 1).status = 'validated'))).toContain('europa-luscher: must stay reference-only until a psychologist signs off');
  });
});
