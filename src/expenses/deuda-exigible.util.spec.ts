import {
  condicionDeudaAbierta,
  condicionDeudaExigible,
  condicionGastoVigente,
} from './deuda-exigible.util';

/** Un query builder que sólo anota lo que le piden. */
function qbFalso() {
  const where: { sql: string; params?: Record<string, unknown> }[] = [];
  const qb: any = {
    andWhere: jest.fn((sql: string, params?: Record<string, unknown>) => {
      where.push({ sql, params });
      return qb;
    }),
  };
  return { qb, where };
}

describe('condiciones de deuda', () => {
  it('(a) vigente: activo y no rechazado', () => {
    const { qb, where } = qbFalso();
    expect(condicionGastoVigente(qb, 'e')).toBe(qb);
    expect(where).toEqual([
      { sql: 'e.estado = true', params: undefined },
      {
        sql: 'e.estado_aprobacion != :dx_rechazado',
        params: { dx_rechazado: 'rechazado' },
      },
    ]);
  });

  it('(b) exigible: activo, aprobado y no pagado', () => {
    const { qb, where } = qbFalso();
    condicionDeudaExigible(qb, 'g');
    expect(where).toEqual([
      { sql: 'g.estado = true', params: undefined },
      {
        sql: 'g.estado_aprobacion = :dx_aprobado',
        params: { dx_aprobado: 'aprobado' },
      },
      { sql: 'g.estado_pago != :dx_pagado', params: { dx_pagado: 'pagado' } },
    ]);
  });

  it('(c) abierta: vigente y no pagado, así los pendientes de firma se ven', () => {
    const { qb, where } = qbFalso();
    condicionDeudaAbierta(qb);
    expect(where.map((w) => w.sql)).toEqual([
      'e.estado = true',
      'e.estado_aprobacion != :dx_rechazado',
      'e.estado_pago != :dx_pagado',
    ]);
  });

  it('los nombres de parámetro no pisan los que ya usa el servicio', () => {
    const { qb, where } = qbFalso();
    condicionDeudaExigible(qb);
    condicionGastoVigente(qb);
    const nombres = where.flatMap((w) => Object.keys(w.params ?? {}));
    for (const usado of [
      'pagado',
      'aprobado',
      'pendiente',
      'companyId',
      'proveedorId',
    ]) {
      expect(nombres).not.toContain(usado);
    }
  });
});
