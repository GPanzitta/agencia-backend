import { atrasado, coincide, digitos, problemaDelCambio, tieneCriterio, tocaHoy } from './interesados.util';

describe('interesados', () => {
  const hilux = { estado: 'disponible', marca: 'Toyota', carroceria: 'pickup', moneda: 'USD', precio_venta: '34900.00' };

  it('cruza por marca, tipo y tope de precio en la misma moneda', () => {
    expect(coincide({ busca_carroceria: 'pickup', precio_max: 36000, precio_moneda: 'USD' }, hilux)).toBe(true);
    expect(coincide({ busca_carroceria: 'pickup', precio_max: 30000, precio_moneda: 'USD' }, hilux)).toBe(false);
    expect(coincide({ busca_marca: 'toyota' }, hilux)).toBe(true);
    expect(coincide({ busca_marca: 'Ford' }, hilux)).toBe(false);
    expect(coincide({ busca_carroceria: 'suv' }, hilux)).toBe(false);
  });

  it('con el tope en otra moneda no inventa una conversión: el tope no filtra', () => {
    expect(coincide({ busca_carroceria: 'pickup', precio_max: 20000000, precio_moneda: 'ARS' }, hilux)).toBe(true);
  });

  it('sin criterio no coincide con nada, y sólo cruza unidades disponibles con precio', () => {
    expect(tieneCriterio({})).toBe(false);
    expect(coincide({}, hilux)).toBe(false);
    expect(coincide({ busca_marca: 'Toyota' }, { ...hilux, estado: 'reservada' })).toBe(false);
    expect(coincide({ busca_marca: 'Toyota' }, { ...hilux, precio_venta: null })).toBe(false);
  });

  it('marca el seguimiento atrasado y el que toca hoy', () => {
    expect(atrasado('contactado', '2026-11-10', '2026-11-12')).toBe(true);
    expect(atrasado('contactado', '2026-11-12', '2026-11-12')).toBe(false);
    expect(tocaHoy('contactado', '2026-11-12', '2026-11-12')).toBe(true);
    expect(atrasado('perdido', '2026-11-10', '2026-11-12')).toBe(false);
    expect(atrasado('nuevo', null, '2026-11-12')).toBe(false);
  });

  it('reconoce el mismo teléfono escrito de dos maneras', () => {
    expect(digitos('+54 9 11 5555-0100')).toBe('1155550100');
    expect(digitos('11 5555 0100')).toBe('1155550100');
    expect(digitos(null)).toBe('');
  });

  it('pide el motivo para perderlo y no mueve al que ya compró', () => {
    expect(problemaDelCambio('visita', 'perdido', '')).toContain('por qué');
    expect(problemaDelCambio('visita', 'perdido', 'Compró en otro lado')).toBeNull();
    expect(problemaDelCambio('ganado', 'contactado', null)).toContain('compró');
    expect(problemaDelCambio('perdido', 'contactado', null)).toBeNull();
    expect(problemaDelCambio('nuevo', 'nuevo', null)).toContain('Ya está');
  });
});

describe('el auto que manda el sitio', () => {
  const { usadoDe } = require('./interesados.util');
  it('lee los datos válidos y descarta lo que no reconoce', () => {
    expect(usadoDe(JSON.stringify({ marca: ' Ford ', modelo: 'Ka', version: '', anio: 2017, km: 105000, combustible: 'gnc', transmision: 'cvt' })))
      .toEqual({ marca: 'Ford', modelo: 'Ka', version: null, anio: 2017, km: 105000, combustible: 'gnc', transmision: null });
  });
  it('sin marca, modelo o año válido no devuelve nada; tampoco con texto roto', () => {
    expect(usadoDe(JSON.stringify({ marca: 'Ford', modelo: 'Ka', anio: 'dosmil' }))).toBeNull();
    expect(usadoDe('{no es json')).toBeNull();
    expect(usadoDe(undefined)).toBeNull();
  });
});
