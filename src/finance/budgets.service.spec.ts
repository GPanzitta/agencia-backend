import { BudgetsService } from './budgets.service';
import { EstadoAprobacion } from '../expenses/entities/expense.enums';

/** Graba el SQL que se le pide; sin base. */
function qbGrabador(filas: unknown[]) {
  const sql: string[] = [];
  const params: Record<string, unknown> = {};
  const qb: any = new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === 'then') return undefined;
        if (prop === 'getRawMany') return jest.fn(async () => filas);
        return (...args: any[]) => {
          for (const a of args) {
            if (typeof a === 'string') sql.push(a);
            else if (a && typeof a === 'object') Object.assign(params, a);
          }
          return qb;
        };
      },
    },
  );
  return { qb, sql, params };
}

describe('BudgetsService.ejecucion — un gasto rechazado no consume presupuesto (#18)', () => {
  it('suma solo los gastos vigentes: activos y no rechazados', async () => {
    const g = qbGrabador([
      { categoria: 'servicios', gastado: '300', comprobantes: '2' },
    ]);
    const budgetRepo: any = {
      find: jest.fn(async () => [
        {
          id: 'b1',
          categoria: 'servicios',
          monto_asignado: '1000',
          umbral_alerta: 80,
        },
      ]),
    };
    const expenseRepo: any = { createQueryBuilder: jest.fn(() => g.qb) };
    const service = new BudgetsService(budgetRepo, expenseRepo);

    const r: any = await service.ejecucion('2026-09-01', 'c1');

    expect(g.sql).toContain('e.estado = true');
    expect(g.sql).toContain('e.estado_aprobacion != :dx_rechazado');
    expect(g.params.dx_rechazado).toBe(EstadoAprobacion.RECHAZADO);
    expect(JSON.stringify(r)).toContain('300');
  });
});
