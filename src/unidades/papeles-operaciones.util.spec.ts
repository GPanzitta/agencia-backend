import { bloqueantesPendientes, papelesDe, semaforo } from './papeles.util';
import { cuenta, problemaDelPago, reservaVencida } from './operaciones.util';

describe('papeles', () => {
  const hoy = '2026-11-12';
  const ok = { estado: 'ok' as const };
  const completos = { titulo: ok, cedula: ok, form_08: ok, informe_dominio: ok, verificacion_policial: ok, libre_deuda: ok, vtv: ok, denuncia_venta: ok };
  it('un usado sin papeles está en rojo y lista los cinco bloqueantes', () => {
    const u = { origen: 'compra' as const, condicion: 'usado' as const, papeles: {} };
    expect(semaforo(u, hoy)).toBe('rojo');
    expect(bloqueantesPendientes(u, hoy)).toHaveLength(5);
  });
  it('con todo en regla está en verde', () => {
    expect(semaforo({ origen: 'compra', condicion: 'usado', papeles: completos }, hoy)).toBe('verde');
  });
  it('un bloqueante en trámite pone amarillo pero sigue frenando la venta', () => {
    const u = { origen: 'compra' as const, condicion: 'usado' as const, papeles: { ...completos, form_08: { estado: 'en_tramite' as const } } };
    expect(semaforo(u, hoy)).toBe('amarillo');
    expect(bloqueantesPendientes(u, hoy)).toEqual(['Formulario 08 firmado']);
  });
  it('una verificación vencida vuelve a frenar', () => {
    const u = { origen: 'compra' as const, condicion: 'usado' as const, papeles: { ...completos, verificacion_policial: { estado: 'ok' as const, vence: '2026-11-01' } } };
    expect(semaforo(u, hoy)).toBe('rojo');
    expect(bloqueantesPendientes(u, hoy)).toHaveLength(1);
  });
  it('la consignación suma su contrato; el 0 km no tiene bloqueantes de transferencia', () => {
    expect(papelesDe({ origen: 'consignacion', condicion: 'usado' }, hoy).some((p) => p.tipo === 'contrato_consignacion')).toBe(true);
    expect(papelesDe({ origen: 'compra', condicion: 'usado' }, hoy).some((p) => p.tipo === 'contrato_consignacion')).toBe(false);
    expect(bloqueantesPendientes({ origen: 'compra', condicion: '0km', papeles: {} }, hoy)).toEqual([]);
  });
});

describe('operación', () => {
  it('suma pagos mixtos en la moneda de la operación', () => {
    const c = cuenta(10000, 'USD', [{ monto: 1000, moneda: 'USD' }, { monto: 3000000, moneda: 'ARS', tipo_cambio: 1500 }]);
    expect(c).toEqual({ pagado: 3000, saldo: 7000, saldada: false });
    expect(cuenta(10000, 'USD', [{ monto: 9999.5, moneda: 'USD' }]).saldada).toBe(true);
  });
  it('no deja cobrar de más ni en otra moneda sin tipo de cambio', () => {
    expect(problemaDelPago({ monto: 500, moneda: 'USD' }, 1000, 'USD', [{ monto: 600, moneda: 'USD' }])).toContain('supera');
    expect(problemaDelPago({ monto: 500, moneda: 'ARS' }, 1000, 'USD', [])).toContain('dólar');
    expect(problemaDelPago({ monto: 400, moneda: 'USD' }, 1000, 'USD', [{ monto: 600, moneda: 'USD' }])).toBeNull();
  });
  it('marca la reserva vencida', () => {
    expect(reservaVencida('reservada', '2026-11-10', '2026-11-12')).toBe(true);
    expect(reservaVencida('reservada', '2026-11-20', '2026-11-12')).toBe(false);
    expect(reservaVencida('vendida', '2026-11-10', '2026-11-12')).toBe(false);
  });
});

describe('papeles para el comprador', () => {
  const { papelesPublicos } = require('./papeles.util');
  const ok = { estado: 'ok' };
  it('un 0 km no muestra papeles', () => {
    expect(papelesPublicos({ origen: 'compra', condicion: '0km', papeles: {} }, '2026-11-13')).toBeNull();
  });
  it('sin nada cargado, todo queda pendiente y no salen los internos', () => {
    const p = papelesPublicos({ origen: 'consignacion', condicion: 'usado', papeles: {} }, '2026-11-13');
    expect(p.al_dia).toBe(false);
    expect(p.items.map((i: { tipo: string }) => i.tipo)).toEqual(['titulo', 'cedula', 'form_08', 'informe_dominio', 'verificacion_policial', 'libre_deuda', 'vtv']);
    expect(p.items.every((i: { estado: string }) => i.estado === 'pendiente')).toBe(true);
  });
  it('al día sólo con todo listo y sin vencer; una VTV vencida vuelve a pendiente', () => {
    const papeles = { titulo: ok, cedula: ok, form_08: ok, informe_dominio: ok, verificacion_policial: ok, libre_deuda: ok, vtv: { estado: 'ok', vence: '2027-01-10' } };
    expect(papelesPublicos({ origen: 'compra', condicion: 'usado', papeles }, '2026-11-13').al_dia).toBe(true);
    const vencida = papelesPublicos({ origen: 'compra', condicion: 'usado', papeles: { ...papeles, vtv: { estado: 'ok', vence: '2026-10-01' }, libre_deuda: { estado: 'en_tramite' } } }, '2026-11-13');
    expect(vencida.al_dia).toBe(false);
    expect(vencida.items.find((i: { tipo: string }) => i.tipo === 'vtv').estado).toBe('pendiente');
    expect(vencida.items.find((i: { tipo: string }) => i.tipo === 'libre_deuda').estado).toBe('en_tramite');
  });
});
