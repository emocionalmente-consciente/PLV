import { describe, expect, it } from 'vitest';
import { buildColorContext } from '../color/context';
import { CE_TRAITS as T } from '../traits';
import {
  type CeRawFactors,
  adjustFactor,
  afanTriunfo,
  catalizadorBase,
  ceIntrapersonal,
  laboriosidad,
  respuestaSobreEsfuerzo,
  scoreCe,
  sumCeFactors,
} from './score';

const NEUTRAL: CeRawFactors = [5, 5, 5, 5, 5, 5];
const scores = (s1: string, s2: string, raw: CeRawFactors = NEUTRAL): Record<string, number> =>
  Object.fromEntries(scoreCe(s1, s2, raw).map((s) => [s.traitId, s.value]));

describe('scoreCe', () => {
  it('returns the 15 traits legacy saves', () => {
    expect(scoreCe('01234567', '32165470', NEUTRAL)).toHaveLength(15);
  });

  // Traced by hand through the W units for the pair in the Protocolo screenshot.
  it.each([
    ['tolerancia a la frustración', T.toleranciaFrustracion, 50],
    ['auto valoración', T.autoValoracion, 80],
    ['laboriosidad', T.laboriosidad, 30],
    ['optimismo', T.optimismo, 40],
    ['respuesta al sobre esfuerzo', T.respuestaSobreEsfuerzo, 50],
    ['afán de triunfo', T.afanTriunfo, 70],
    ['C.E. intrapersonal', T.ceIntrapersonal, 58],
    ['catalizador de cambios', T.catalizadorCambios, 60],
    ['consideración con los demás', T.consideracionDemas, 35],
    ['influencia', T.influencia, 70],
    ['dominio/empuje', T.dominioEmpuje, 70],
    ['lealtad grupal', T.lealtadGrupal, 50],
    ['comunicación', T.comunicacion, 55],
    ['C.E. interpersonal', T.ceInterpersonal, 56],
    ['factor G emocional', T.factorGEmocional, 57],
  ])('scores %s by hand', (_name, trait, expected) => {
    expect(scores('01234567', '32165470')[trait]).toBe(expected);
  });

  it('applies each questionnaire factor to its own trait', () => {
    const base = scores('01234567', '32165470');
    const high = scores('01234567', '32165470', [7, 6, 6, 7, 6, 7]);
    expect((high[T.catalizadorCambios] ?? 0) - (base[T.catalizadorCambios] ?? 0)).toBe(10);
    expect((high[T.consideracionDemas] ?? 0) - (base[T.consideracionDemas] ?? 0)).toBe(10);
    expect(high[T.influencia]).toBe(80);
    expect(high[T.dominioEmpuje]).toBe(80);
    expect((high[T.lealtadGrupal] ?? 0) - (base[T.lealtadGrupal] ?? 0)).toBe(10);
    expect((high[T.comunicacion] ?? 0) - (base[T.comunicacion] ?? 0)).toBe(10);
  });

  it('keeps each trait between 0 and 100 after the factor', () => {
    const low = scores('01234567', '32165470', [0, 0, 0, 0, 0, 0]);
    const high = scores('76543210', '34210567', [10, 10, 10, 10, 10, 10]);
    for (const value of [...Object.values(low), ...Object.values(high)]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});

describe('the legacy CE chart screenshot', () => {
  // Graficos/_ScreenCaptureCE/Grafica.bmp is the session in the Protocolo screenshot. Its raw factors
  // aren't known, so these are the only totals that give its six interpersonal scores.
  const raw: CeRawFactors = [10, 0, 10, 10, 10, 10];
  const scored = scores('01234567', '32165470', raw);

  it.each([
    ['tolerancia a la frustración', T.toleranciaFrustracion, 50],
    ['auto valoración', T.autoValoracion, 80],
    ['laboriosidad', T.laboriosidad, 30],
    ['optimismo', T.optimismo, 40],
    ['afán de triunfo', T.afanTriunfo, 70],
    ['C.E. interpersonal', T.ceInterpersonal, 81],
    ['catalizador de cambios', T.catalizadorCambios, 90],
    ['consideración con los demás', T.consideracionDemas, 25],
    ['influencia', T.influencia, 100],
    ['dominio/empuje', T.dominioEmpuje, 100],
    ['lealtad grupal', T.lealtadGrupal, 90],
    ['comunicación', T.comunicacion, 85],
  ])('matches %s', (_name, trait, expected) => {
    expect(scored[trait]).toBe(expected);
  });

  // The screenshot shows 100, 67 and 74 for these. They differ by the decision on the written conditions.
  it.each([
    ['respuesta al sobre esfuerzo', T.respuestaSobreEsfuerzo, 50],
    ['C.E. intrapersonal', T.ceIntrapersonal, 58],
    ['factor G emocional', T.factorGEmocional, 69],
  ])('differs on purpose for %s', (_name, trait, expected) => {
    expect(scored[trait]).toBe(expected);
  });
});

describe('conditions as written, where legacy differs by decision', () => {
  // Legacy ignored these lists because of Pascal operator precedence.
  const noLetters = buildColorContext('12345067', '12345067');

  it('has a test pair with no letters', () => {
    expect(noLetters.letters.trim()).toBe('');
  });

  it('uses the table for Laboriosidad with no letters, where legacy gave 75', () => {
    // The 4 is fourth, which gives 40, and the 3 is third, which adds 10.
    expect(laboriosidad(noLetters)).toBe(50);
  });

  it('uses the table for Afán de Triunfo with no letters, where legacy gave 100', () => {
    expect(afanTriunfo(noLetters)).toBe(60);
  });

  it('requires every condition for Sobre Esfuerzo, where legacy gave 100 for any _ on the 7', () => {
    const ctx = buildColorContext('01234567', '32165470');
    expect(ctx.sign(ctx.n7)).toBe('_');
    expect(ctx.marks).not.toBe('.');
    expect(respuestaSobreEsfuerzo(ctx)).toBe(50);
  });
});

describe('catalizadorBase', () => {
  it('reads past the end of the series safely when 5 or 4 is last', () => {
    expect(() => catalizadorBase(buildColorContext('01234567', '32106745'))).not.toThrow();
    expect(() => catalizadorBase(buildColorContext('01234567', '32106754'))).not.toThrow();
  });

  it('takes 10 off when both series are the same', () => {
    // The 5 is sixth, which gives 40.
    expect(catalizadorBase(buildColorContext('12340567', '12340567'))).toBe(30);
    expect(catalizadorBase(buildColorContext('01234567', '12340567'))).toBe(40);
  });
});

describe('ceIntrapersonal', () => {
  it('applies the legacy adjustments before averaging', () => {
    // 60 + 70 + 30 + 40 + 65 + 50 = 315, and 315 div 6 = 52.
    expect(ceIntrapersonal(50, 50, 30, 40, 60, 100)).toBe(52);
  });
});

describe('adjustFactor', () => {
  it.each([
    [0, -20], [1, -20], [2, -10], [3, -10], [4, 0], [6, 0], [7, 10], [8, 20], [9, 30], [10, 30], [11, 11],
  ])('factors 1, 4 and 6 turn %i into %i', (raw, expected) => {
    expect(adjustFactor(1, raw)).toBe(expected);
    expect(adjustFactor(4, raw)).toBe(expected);
    expect(adjustFactor(6, raw)).toBe(expected);
  });

  it.each([
    [0, -10], [2, -10], [3, 0], [5, 0], [6, 10], [7, 20], [8, 30], [9, 40], [10, 40], [11, 11],
  ])('factors 2, 3 and 5 turn %i into %i', (raw, expected) => {
    expect(adjustFactor(2, raw)).toBe(expected);
    expect(adjustFactor(3, raw)).toBe(expected);
    expect(adjustFactor(5, raw)).toBe(expected);
  });
});

describe('sumCeFactors', () => {
  const scoring = [
    { itemId: 'ce:1', traitId: T.catalizadorCambios, points: { A: 2, B: 1, C: 0 } },
    { itemId: 'ce:2', traitId: T.comunicacion, points: { A: 0, B: 1, C: 2 } },
  ];

  it('adds the points of the chosen option to the item factor', () => {
    expect(sumCeFactors([{ itemId: 'ce:1', option: 'A' }, { itemId: 'ce:2', option: 'C' }], scoring)).toEqual([2, 0, 0, 0, 0, 2]);
  });

  it('throws for a trait that is not a CE factor', () => {
    const wrong = [{ itemId: 'ce:1', traitId: T.laboriosidad, points: { A: 2, B: 1, C: 0 } }];
    expect(() => sumCeFactors([{ itemId: 'ce:1', option: 'A' }], wrong)).toThrow(RangeError);
  });

  it('throws for an item with no scoring row', () => {
    expect(() => sumCeFactors([{ itemId: 'ce:9', option: 'A' }], scoring)).toThrow(RangeError);
  });
});
