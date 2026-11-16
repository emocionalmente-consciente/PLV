import 'fake-indexeddb/auto';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('starts on the passphrase screen, in Spanish', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Frase de acceso');
    expect(html).toContain('Abrir paquete');
    expect(html).toContain('type="password"');
  });

  it('offers the demo content', () => {
    expect(renderToStaticMarkup(<App />)).toContain('contenido de demostración');
  });

  it('keeps the open button disabled until a file and passphrase are given', () => {
    expect(renderToStaticMarkup(<App />)).toMatch(/<button type="submit" disabled/);
  });
});
