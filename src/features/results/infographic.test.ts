import { describe, expect, it } from 'vitest';
import { demoOperatorPack } from '../../content/demo-content';
import type { SessionRecord } from '../../data/repositories';
import { P4_TRAITS } from '../../domain/traits';
import { type CeOption, applyCe, applyCi, applyColor, newSession } from '../capture/build';
import { buildInfographic, classifyTrait } from './infographic';

const pack = demoOperatorPack();
const session = () => newSession(pack, { id: 's1', examineeId: 'e1', birthDate: '1990-06-15', testDate: '2020-06-15', maritalStatus: null, profileId: 'factory:2' });
const color = (): SessionRecord => applyColor(pack, { session: session() }, '01234567', '32165470');

/** A colour session with chosen scores and result codes, so each rule can be driven directly. */
function withResults(scores: Record<string, number>, codes: Record<number, string>): SessionRecord {
  const record = color();
  const colorResult = record.colorResult;
  if (!colorResult) throw new Error('no color result');
  return {
    ...record,
    scores: Object.entries(scores).map(([traitId, value]) => ({ sessionId: 's1', traitId, value, textId: null })),
    colorResult: { ...colorResult, qualitative: Object.entries(codes).map(([slot, baseCode]) => ({ slot: Number(slot), baseCode, textId: `${baseCode}A` })) },
  };
}

const T = P4_TRAITS;
const SAMPLE = {
  [T.actividad]: 45,
  [T.creatividad]: 42,
  [T.independencia]: 50,
  [T.liderazgo]: 85,
  [T.logro]: 90,
  [T.percepcionSalud]: 60,
  [T.perseverancia]: 80,
  [T.responsabilidad]: 80,
  [T.sociabilidad]: 45,
  [T.ceGlobal]: 42,
  [T.autodominio]: 25,
  [T.positividad]: 40,
  [T.autoestima]: 80,
  [T.respuestaEstres]: 50,
};
const SAMPLE_CODES = { 2: 'CB05', 35: 'CE03', 37: 'CG09', 40: 'CK03', 42: 'CM03' };

describe('classifyTrait', () => {
  it.each([
    [T.actividad, 20, 'alert'],
    [T.actividad, 40, 'watch'],
    [T.actividad, 45, 'avg'],
    [T.actividad, 60, 'avg'],
    [T.actividad, 61, 'strong'],
    [T.liderazgo, 79, 'strong'],
    [T.liderazgo, 85, 'watch'],
    [T.percepcionSalud, 30, 'avg'],
    [T.percepcionSalud, 60, 'watch'],
    [T.percepcionSalud, 80, 'alert'],
  ])('%s at %d is %s', (traitId, value, tone) => {
    expect(classifyTrait(traitId, value).tone).toBe(tone);
  });
});

describe('buildInfographic', () => {
  it('reads the verdict, stability and forecast from the color codes', () => {
    const info = buildInfographic(pack, withResults(SAMPLE, SAMPLE_CODES));
    expect(info?.verdict).toMatchObject({ code: 'CM03', label: 'Aceptable con reservas', tone: 'watch' });
    expect(info?.stability).toMatchObject({ code: 'CB05', tone: 'alert' });
    expect(info?.stabilityEvolution?.trend).toBe('down');
    expect(info?.forecast?.label).toBe('Desfavorable');
    expect(info?.forecastEvolution?.trend).toBe('flat');
  });

  it('sorts the bars from the highest score', () => {
    const info = buildInfographic(pack, withResults(SAMPLE, SAMPLE_CODES));
    expect(info?.workTraits.map((b) => b.value)).toEqual([90, 85, 80, 80, 60, 50, 45, 45, 42]);
    expect(info?.emotionalTraits.map((b) => b.value)).toEqual([80, 50, 42, 40, 25]);
  });

  it('chooses the follow-up cards from the scores, most urgent first', () => {
    const info = buildInfographic(pack, withResults(SAMPLE, SAMPLE_CODES));
    expect(info?.followUps.map((f) => [f.id, f.priority])).toEqual([
      ['verification', 'alta'],
      ['self-control', 'alta'],
      ['role-limits', 'media'],
      ['wellbeing', 'media'],
      ['performance', 'media'],
      ['outlook', 'media'],
      ['creativity', 'baja'],
      ['strengths', 'aprovechar'],
    ]);
    expect(info?.followUps.find((f) => f.id === 'role-limits')?.triggers.map((t) => t.value)).toEqual(['85', '80']);
  });

  it('gives an average profile no warning cards', () => {
    const average = Object.fromEntries(Object.keys(SAMPLE).map((id) => [id, 50]));
    const info = buildInfographic(pack, withResults(average, { 2: 'CB01', 35: 'CE02', 37: 'CG02', 40: 'CK03', 42: 'CM01' }));
    expect(info?.followUps).toEqual([]);
  });

  it('adds a generic card for another low trait', () => {
    const info = buildInfographic(pack, withResults({ ...SAMPLE, [T.sociabilidad]: 30 }, SAMPLE_CODES));
    expect(info?.followUps.find((f) => f.id === `low-${T.sociabilidad}`)?.priority).toBe('media');
  });

  it('works with only the CI', () => {
    const ticks = new Set(pack.ci.key.slice(0, 10).map((k) => k.itemId));
    const info = buildInfographic(pack, applyCi(pack, { session: session() }, ticks));
    expect(info?.ci).not.toBeNull();
    expect(info?.verdict).toBeNull();
    expect(info?.workTraits).toEqual([]);
  });

  it('works on a real scored color session', () => {
    const info = buildInfographic(pack, color());
    expect(info?.verdict).not.toBeNull();
    expect(info?.workTraits.length).toBeGreaterThan(0);
  });

  it('does not cover the C.E. module', () => {
    const answers = Object.fromEntries(pack.ce.items.map((i) => [i.id, 'A' as CeOption]));
    const record = applyCe(pack, { session: session() }, '01234567', '32165470', answers);
    expect(record.session.instruments.ce).toBe(true);
    expect(buildInfographic(pack, record)).toBeNull();
  });
});
