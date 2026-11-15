import { convertir, costoTotal, diasEnStock, dominioValido, margen, normalizarDominio, problemaDelAlta, problemaDelImporte, puedePasarA } from './unidades.util';

describe('dominio', () => {
  it('normaliza y reconoce los dos formatos argentinos', () => {
    expect(normalizarDominio(' ab 123 cd ')).toBe('AB123CD');
    expect(normalizarDominio('')).toBeNull();
    expect(dominioValido('ABC123')).toBe(true);
    expect(dominioValido('AB123CD')).toBe(true);
    expect(dominioValido('A1B2C3')).toBe(false);
  });
});

describe('plata en dos monedas', () => {
  it('convierte con el tipo de cambio del movimiento', () => {
    expect(convertir({ monto: 150000, moneda: 'ARS', tipo_cambio: 1500 }, 'USD')).toBe(100);
    expect(convertir({ monto: 100, moneda: 'USD', tipo_cambio: 1500 }, 'ARS')).toBe(150000);
    expect(convertir({ monto: 100, moneda: 'USD' }, 'USD')).toBe(100);
  });
  it('sin tipo de cambio no inventa una conversión', () => {
    expect(convertir({ monto: 100, moneda: 'ARS' }, 'USD')).toBeNull();
    expect(problemaDelImporte({ monto: 100, moneda: 'ARS' }, 'USD')).toContain('dólar');
    expect(problemaDelImporte({ monto: 0, moneda: 'USD' }, 'USD')).toContain('mayor a cero');
    expect(problemaDelImporte({ monto: 100, moneda: 'USD' }, 'USD')).toBeNull();
  });
});

describe('costo y margen', () => {
  const gastos = [{ monto: 200, moneda: 'USD' as const }, { monto: 300000, moneda: 'ARS' as const, tipo_cambio: 1500 }];
  it('unidad propia: adquisición más gastos', () => {
    const u = { origen: 'compra' as const, moneda: 'USD' as const, costo_adquisicion: '10000.00', precio_venta: '12500.00', gastos };
    expect(costoTotal(u)).toBe(10400);
    expect(margen(u)).toBe(2100);
  });
  it('consignación: el margen descuenta el piso del dueño y los gastos', () => {
    const u = { origen: 'consignacion' as const, moneda: 'USD' as const, costo_adquisicion: 0, precio_piso: 9000, precio_venta: 10000, gastos };
    expect(costoTotal(u)).toBe(400);
    expect(margen(u)).toBe(600);
  });
  it('sin precio no hay margen', () => {
    expect(margen({ origen: 'compra', moneda: 'USD', costo_adquisicion: 1, precio_venta: null })).toBeNull();
  });
  it('cuenta los días en stock sin dar negativos', () => {
    expect(diasEnStock('2026-11-01', '2026-11-12')).toBe(11);
    expect(diasEnStock('2026-11-12', '2026-11-01')).toBe(0);
  });
});

describe('estados y alta', () => {
  it('a mano sólo se mueve dentro del stock, a baja, o se devuelve una consignación', () => {
    expect(puedePasarA('ingreso', 'disponible', 'compra')).toBe(true);
    expect(puedePasarA('disponible', 'reservada', 'compra')).toBe(false);
    expect(puedePasarA('vendida', 'disponible', 'compra')).toBe(false);
    expect(puedePasarA('disponible', 'devuelta', 'compra')).toBe(false);
    expect(puedePasarA('disponible', 'devuelta', 'consignacion')).toBe(true);
  });
  it('rechaza las altas sin sentido', () => {
    expect(problemaDelAlta({ origen: 'compra', condicion: 'usado' })).toContain('dominio');
    expect(problemaDelAlta({ origen: 'compra', condicion: 'usado', dominio: 'XX1' })).toContain('patente');
    expect(problemaDelAlta({ origen: 'consignacion', condicion: 'usado', dominio: 'ABC123', costo_adquisicion: 5 })).toContain('consignación');
    expect(problemaDelAlta({ origen: 'consignacion', condicion: 'usado', dominio: 'ABC123' })).toContain('dueño');
    expect(problemaDelAlta({ origen: 'compra', condicion: '0km' })).toBeNull();
    expect(problemaDelAlta({ origen: 'toma', condicion: 'usado', dominio: 'ab123cd' })).toBeNull();
  });
});
