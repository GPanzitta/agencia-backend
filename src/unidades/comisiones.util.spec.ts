import { comisionSugerida, resumenPorVendedor } from './comisiones.util';
import { estadoVigente, problemaDeReserva, soloDigitos, sumarDias } from '../interesados/reservas-web.util';

describe('comisiones', () => {
  it('calcula la comisión con el porcentaje del vendedor', () => {
    expect(comisionSugerida(10000, 1.5)).toBe(150);
    expect(comisionSugerida('18500000', '2')).toBe(370000);
  });
  it('sin porcentaje no sugiere nada', () => {
    expect(comisionSugerida(10000, null)).toBeNull();
    expect(comisionSugerida(10000, 0)).toBeNull();
  });
  it('suma por vendedor sin mezclar monedas y separa lo pendiente', () => {
    const r = resumenPorVendedor([
      { id: '1', vendedorId: 'a', precio: 10000, moneda: 'USD', comision: 100, pagada: true },
      { id: '2', vendedorId: 'a', precio: 20000000, moneda: 'ARS', comision: 400000, pagada: false },
      { id: '3', vendedorId: 'a', precio: 5000, moneda: 'USD', comision: null, pagada: false },
      { id: '4', vendedorId: null, precio: 7000, moneda: 'USD', comision: 70, pagada: false },
    ]);
    expect(r.get('a')).toEqual({ ventas: 3, vendido: { ARS: 20000000, USD: 15000 }, comision: { ARS: 400000, USD: 100 }, pendiente: { ARS: 400000, USD: 0 } });
    expect(r.get('')?.pendiente.USD).toBe(70);
  });
});

describe('reserva desde el sitio', () => {
  it('un pedido pendiente con el plazo pasado cuenta como vencido', () => {
    const ahora = new Date('2026-11-13T12:00:00Z');
    expect(estadoVigente('pendiente', '2026-11-13T11:00:00Z', ahora)).toBe('vencida');
    expect(estadoVigente('pendiente', '2026-11-13T13:00:00Z', ahora)).toBe('pendiente');
    expect(estadoVigente('confirmada', '2026-11-01T00:00:00Z', ahora)).toBe('confirmada');
  });
  it('suma días cruzando el mes y el año', () => {
    expect(sumarDias('2026-11-28', 7)).toBe('2026-12-05');
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02');
  });
  it('pide lo que falta para tomar reservas', () => {
    expect(problemaDeReserva({ monto: 0 })).toMatch(/seña/);
    expect(problemaDeReserva({ monto: 200000, moneda: 'ARS', alias: ' ' })).toMatch(/alias/);
    expect(problemaDeReserva({ monto: 200000, moneda: 'ARS', alias: 'agencia.demo', titular: '' })).toMatch(/nombre/);
    expect(problemaDeReserva({ monto: 200000, moneda: 'ARS', alias: 'agencia.demo', titular: 'Agencia Demo SRL' })).toBeNull();
  });
  it('compara teléfonos por sus dígitos', () => {
    expect(soloDigitos('+54 9 11 5555-0100')).toBe('5491155550100');
  });
});
