import { describe, expect, it } from 'vitest';
import { P4_TRAITS as T } from '../traits';
import { baseFromEquals, buildColorContext, positivity, selfRegard } from './context';
import { autodominio, ceGlobal, respuestaEstres, scoreP4 } from './p4';

const scores = (s1: string, s2: string): Record<string, number> =>
  Object.fromEntries(scoreP4(s1, s2).map((s) => [s.traitId, s.value]));

describe('scoreP4', () => {
  it('returns the 14 traits legacy saves', () => {
    expect(scoreP4('01234567', '32165470')).toHaveLength(14);
  });

  // Traced by hand through UAlgoritColorIntra.pas and UAlgoritColorInter.pas for the pair in
  // the legacy Protocolo screenshot: signs ++X==___, letters C....AAA, one mark.
  it.each([
    ['autodominio', T.autodominio, 50],
    ['positividad', T.positividad, 40],
    ['autoestima', T.autoestima, 80],
    ['respuesta al estrés', T.respuestaEstres, 50],
    ['C.E. global', T.ceGlobal, 51],
    ['actividad', T.actividad, 45],
    ['creatividad', T.creatividad, 30],
    ['independencia', T.independencia, 50],
    ['liderazgo', T.liderazgo, 85],
    ['logro', T.logro, 90],
    ['percepción de la salud', T.percepcionSalud, 60],
    ['perseverancia', T.perseverancia, 80],
    ['responsabilidad', T.responsabilidad, 90],
    ['sociabilidad', T.sociabilidad, 55],
  ])('scores %s by hand', (_name, trait, expected) => {
    expect(scores('01234567', '32165470')[trait]).toBe(expected);
  });
});

describe('ceGlobal', () => {
  it('fixes Autoestima at 55, as legacy does', () => {
    // 40 + 40 + 55 + 40 = 175, and 175 div 4 = 43.
    expect(ceGlobal(40, 40, 40)).toBe(43);
  });

  it('adds 10 to Autodominio above 49, and 5 to the stress response above 59', () => {
    // 60 + 40 + 55 + 40 = 195, so 48.
    expect(ceGlobal(50, 40, 40)).toBe(48);
    // 40 + 40 + 55 + 65 = 200, so 50.
    expect(ceGlobal(40, 40, 60)).toBe(50);
  });

  it.each([
    [50, 70],
    [60, 80],
    [70, 90],
    [80, 100],
    [90, 50],
  ])('maps Positividad %i to %i', (positive, mapped) => {
    expect(ceGlobal(40, positive, 40)).toBe(Math.trunc((40 + mapped + 55 + 40) / 4));
  });

  it('caps the result at 100', () => {
    expect(ceGlobal(100, 80, 100)).toBeLessThanOrEqual(100);
  });
});

describe('baseFromEquals', () => {
  it.each([
    ['++XX____', 10],
    ['++XX=___', 25],
    ['++XX==__', 50],
    ['++XX===_', 75],
    ['+XX====_', 90],
    ['+X=====_', 90],
  ])('starts %s at %i', (signs, expected) => {
    expect(baseFromEquals(signs)).toBe(expected);
  });
});

describe('rules that reduce to a clear case', () => {
  it('adds 10 to Autodominio only above 50', () => {
    const ctx = buildColorContext('12345067', '12345067');
    expect(ctx.signs).toBe('++XX==__');
    // Base 50, the 1 has +, no C letters: 60, then above 50 gives 70.
    expect(autodominio(ctx)).toBe(70);
  });

  it('gives the top stress response with no marks or letters and a _ on the 7', () => {
    const ctx = buildColorContext('12345067', '12345067');
    // Two = signs, so this is legacy Caso4.
    expect(respuestaEstres(ctx)).toBe(70);
  });

  it('shares Positividad and Autoestima rules with CE', () => {
    const ctx = buildColorContext('01234567', '43125607');
    expect(positivity(ctx)).toBeGreaterThanOrEqual(10);
    expect(selfRegard(ctx)).toBeGreaterThanOrEqual(0);
  });
});
