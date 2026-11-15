import { finDeDia, horaLocal, inicioDeDia, inicioDelMesActual } from './fechas.util';

/**
 * El bug que motivó este helper: pedir un reporte "hasta hoy" devolvía cero
 * porque el límite superior caía en la medianoche UTC del propio día.
 */
describe('fechas.util (offset por defecto -3)', () => {
  it('inicioDeDia lleva una fecha suelta al comienzo del día local', () => {
    expect(inicioDeDia('2026-08-24')!.toISOString()).toBe('2026-08-24T03:00:00.000Z');
  });

  it('finDeDia es inclusive: cubre hasta el último milisegundo del día local', () => {
    expect(finDeDia('2026-08-24')!.toISOString()).toBe('2026-08-25T02:59:59.999Z');
  });

  it('un movimiento de la tarde del 24 entra en el rango "hasta el 24"', () => {
    const movimiento = new Date('2026-08-24T19:52:00.000Z'); // 16:52 hora local
    expect(movimiento <= finDeDia('2026-08-24')!).toBe(true);
  });

  it('el servicio de la noche también entra (23:30 local del 24)', () => {
    const cena = new Date('2026-08-25T02:30:00.000Z');
    expect(cena <= finDeDia('2026-08-24')!).toBe(true);
  });

  it('el día siguiente queda afuera', () => {
    const manana = new Date('2026-08-25T03:00:00.000Z'); // 00:00 local del 25
    expect(manana <= finDeDia('2026-08-24')!).toBe(false);
  });

  it('si el valor trae hora, se respeta tal cual', () => {
    expect(finDeDia('2026-08-24T10:00:00.000Z')!.toISOString())
      .toBe('2026-08-24T10:00:00.000Z');
  });

  it('sin valor devuelve el default recibido', () => {
    const def = new Date('2020-01-01T00:00:00.000Z');
    expect(finDeDia(undefined, def)).toBe(def);
    expect(inicioDeDia(undefined, def)).toBe(def);
  });

  it('inicioDelMesActual cae en el día 1 a las 00:00 locales', () => {
    const r = inicioDelMesActual();
    expect(r.toISOString()).toMatch(/-01T03:00:00\.000Z$/);
  });
});

describe('horaLocal', () => {
  it('da la hora del taller, no la del proceso (que en Render es UTC)', () => {
    // 2026-09-22T21:30:00Z con offset −3 es el mismo día 18:30 en el taller.
    expect(horaLocal(new Date('2026-09-22T21:30:00Z'))).toBe('18:30');
  });

  it('cruza el día hacia atrás: 01:15 UTC son las 22:15 del día anterior', () => {
    expect(horaLocal(new Date('2026-09-23T01:15:00Z'))).toBe('22:15');
  });

  it('rellena con cero a la izquierda', () => {
    expect(horaLocal(new Date('2026-09-22T12:05:00Z'))).toBe('09:05');
  });

  it('la medianoche del taller es 00:00', () => {
    expect(horaLocal(new Date('2026-09-23T03:00:00Z'))).toBe('00:00');
  });
});
