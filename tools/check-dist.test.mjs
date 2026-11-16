import { describe, expect, it } from 'vitest';
import { countMatches, normalize } from './check-dist.mjs';

describe('normalize', () => {
  it('removes accents, case, spaces and punctuation', () => {
    expect(normalize('¡Évaluación  de la Prueba!')).toBe('evaluaciondelaprueba');
  });

  it('decodes the unicode escapes that bundlers write', () => {
    expect(normalize('evaluaci\\u00f3n')).toBe('evaluacion');
  });
});

describe('countMatches', () => {
  const needles = [normalize('Un texto restringido del informe')];

  it('finds a string however it is laid out', () => {
    expect(countMatches(normalize('<p>UN TEXTO\n restringido, del <em>informe</em></p>'), needles)).toBe(1);
  });

  it('finds nothing in other text', () => {
    expect(countMatches(normalize('Esta aplicación está en construcción.'), needles)).toBe(0);
  });
});
