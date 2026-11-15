import { exigirCupo, ordenesDelMes } from './cupo-abono';
import { inicioDelMesActual } from '../common/fechas.util';

/** Un `em` falso que contesta el plan, el tope y las órdenes del mes. */
function emFalso(datos: { plan?: string; tope?: number; usadas?: number }) {
  const consultas: { sql: string; params: unknown[] }[] = [];
  return {
    consultas,
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      consultas.push({ sql, params });
      if (/FROM "company"/.test(sql)) return datos.plan ? [{ plan: datos.plan }] : [];
      if (/plataforma_config/.test(sql)) return [{ tope_ordenes_gratis: datos.tope ?? 30 }];
      if (/"unidades"/.test(sql)) return [{ n: datos.usadas ?? 0 }];
      return [];
    }),
  };
}

describe('exigirCupo', () => {
  it('con 29 órdenes en plan gratis, la 30 pasa', async () => {
    await expect(exigirCupo(emFalso({ plan: 'gratis', usadas: 29 }) as never, 'c1')).resolves.toBeUndefined();
  });

  it('con 30 órdenes en plan gratis, la 31 se rechaza con el código y los números', async () => {
    await expect(exigirCupo(emFalso({ plan: 'gratis', usadas: 30 }) as never, 'c1')).rejects.toMatchObject({
      codigo: 'TOPE_PLAN_GRATIS',
      response: expect.objectContaining({ tope: 30, usadas: 30 }),
    });
  });

  it('respeta el tope editado desde el panel', async () => {
    await expect(exigirCupo(emFalso({ plan: 'gratis', tope: 5, usadas: 5 }) as never, 'c1')).rejects.toMatchObject({
      codigo: 'TOPE_PLAN_GRATIS',
    });
  });

  it.each(['pago', 'interno'])('el plan %s no cuenta órdenes', async (plan) => {
    const em = emFalso({ plan, usadas: 5000 });
    await exigirCupo(em as never, 'c1');
    expect(em.consultas.some((c) => /"unidades"/.test(c.sql))).toBe(false);
  });
});

describe('ordenesDelMes', () => {
  // Agencia (12/11/2026): el cupo gratis son unidades en stock a la vez, no órdenes por mes.
  it('cuenta las unidades en stock de esa agencia, sin las vendidas ni las que salieron', async () => {
    const em = emFalso({ usadas: 7 });
    await expect(ordenesDelMes(em as never, 'c1')).resolves.toBe(7);
    const { sql, params } = em.consultas[0];
    expect(sql).toMatch(/'ingreso', 'alistaje', 'disponible', 'reservada'/);
    expect(sql).not.toMatch(/vendida|devuelta|baja/);
    expect(sql).toMatch(/company_id/);
    expect(params).toEqual(['c1']);
  });
});

describe('inicioDelMesActual', () => {
  afterEach(() => jest.useRealTimers());

  it('el último minuto del mes en Argentina todavía es ese mes', () => {
    // 1/12 02:59 UTC es 30/11 23:59 en Argentina (UTC-3).
    jest.useFakeTimers({ now: new Date('2026-12-01T02:59:00.000Z') });
    expect(inicioDelMesActual().toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });

  it('un minuto después ya cuenta el mes nuevo', () => {
    jest.useFakeTimers({ now: new Date('2026-12-01T03:00:00.000Z') });
    expect(inicioDelMesActual().toISOString()).toBe('2026-12-01T03:00:00.000Z');
  });
});
