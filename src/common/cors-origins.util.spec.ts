import { obtenerOrigenesCors } from './cors-origins.util';

describe('obtenerOrigenesCors (SEG-12)', () => {
  it('en desarrollo suma los localhost y los de CORS_ORIGINS', () => {
    const o = obtenerOrigenesCors({ STAGE: 'dev', CORS_ORIGINS: 'https://erp.ejemplo.com' });
    expect(o).toEqual(['http://localhost:4400', 'http://localhost:3201', 'https://erp.ejemplo.com']);
  });

  it('en producción NO habilita los localhost', () => {
    const o = obtenerOrigenesCors({ STAGE: 'prod', CORS_ORIGINS: 'https://erp.ejemplo.com, https://portal.ejemplo.com' });
    expect(o).toEqual(['https://erp.ejemplo.com', 'https://portal.ejemplo.com']);
    expect(o.some((x) => x.includes('localhost'))).toBe(false);
  });
});
