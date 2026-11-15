import { NotFoundException } from '@nestjs/common';

import { RecurringExpensesService } from './recurring-expenses.service';
import { Frecuencia, RecurringExpense } from './entities/recurring-expense.entity';
import { Proveedor } from '../proveedores/entities/proveedore.entity';
import { CategoriaGasto, MetodoPagoGasto } from '../expenses/entities/expense.enums';

/** Fecha local a mediodía, como las deja `fechaLocal` del util. */
const d = (s: string) => new Date(s + 'T12:00:00');
const ymd = (f: Date | string | null | undefined) => {
  if (f == null) return f;
  if (typeof f === 'string') return f.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}`;
};

function plantilla(p: Partial<RecurringExpense> = {}): RecurringExpense {
  return Object.assign(new RecurringExpense(), {
    id: 'r1',
    descripcion: 'Alquiler',
    categoria: CategoriaGasto.ALQUILER,
    monto: 1000,
    metodo_pago: MetodoPagoGasto.TRANSFERENCIA,
    frecuencia: Frecuencia.MENSUAL,
    dia_vencimiento: 10,
    fecha_inicio: '2026-01-10' as unknown as Date,
    fecha_fin: null,
    proveedor: { id: 'prov-viejo', nombre: 'Inmobiliaria' } as never,
    proxima_generacion: '2027-06-10' as unknown as Date,
    generados: 5,
    activo: true,
    notas: 'contrato 2026',
    companyId: 'c1',
    ...p,
  });
}

/**
 * Sin base: el repo guarda en memoria una sola plantilla y el EntityManager de
 * la transacción anota los gastos que se crean (con su fecha).
 */
function armar(inicial: RecurringExpense | null) {
  let fila = inicial;
  const gastos: { fecha: string }[] = [];
  const recurrenteRepo: any = {
    findOne: jest.fn(async () => (fila ? Object.assign(new RecurringExpense(), fila) : null)),
    save: jest.fn(async (r: RecurringExpense) => {
      fila = Object.assign(new RecurringExpense(), r);
      return fila;
    }),
    find: jest.fn(async () => (fila ? [Object.assign(new RecurringExpense(), fila)] : [])),
    create: jest.fn((x: unknown) => x),
  };
  const settingsRepo: any = { findOne: jest.fn(async () => null) };
  const filtrosNumeracion: unknown[][] = [];
  const qb: any = {
    where: () => qb,
    andWhere: (...a: unknown[]) => {
      filtrosNumeracion.push(a);
      return qb;
    },
    orderBy: () => qb,
    addOrderBy: () => qb,
    getOne: async () => null,
  };
  // La relectura bajo lock va por QueryBuilder, que no trae las relaciones
  // eager: sin proveedor, como en la base.
  const locks: string[] = [];
  const lockQb: any = {
    where: () => lockQb,
    setLock: (modo: string) => {
      locks.push(modo);
      return lockQb;
    },
    getOne: async () => {
      if (!fila) return null;
      const { proveedor: _p, ...sinRelaciones } = fila as any;
      return Object.assign(new RecurringExpense(), sinRelaciones);
    },
  };
  const consultas: unknown[][] = [];
  const em: any = {
    createQueryBuilder: (entidad: unknown) => (entidad === RecurringExpense ? lockQb : qb),
    findOne: jest.fn(async (entidad: unknown, o: any) => {
      // SEG-07: el proveedor se carga con el filtro de empresa; los de otro taller no aparecen.
      if (entidad === Proveedor) return String(o?.where?.id).startsWith('prov-') ? { id: o.where.id } : null;
      return fila ? Object.assign(new RecurringExpense(), fila) : null;
    }),
    query: jest.fn(async (...args: unknown[]) => {
      consultas.push(args);
      return [];
    }),
    create: (_e: unknown, x: any) => x,
    save: jest.fn(async (entidad: unknown, x: any) => {
      if (entidad === RecurringExpense) {
        // Como TypeORM: lo que viene en undefined (la relación que la lectura
        // con lock no trae) no se toca.
        const definidos = Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined));
        fila = Object.assign(new RecurringExpense(), fila, definidos);
      } else {
        gastos.push({ fecha: ymd(x.fecha) as string });
      }
      return x;
    }),
  };
  const dataSource: any = { transaction: jest.fn(async (cb: any) => cb(em)) };
  const service = new RecurringExpensesService(recurrenteRepo, settingsRepo, dataSource);
  /** Lo que se guardó de la plantilla, por la transacción o por el repo. */
  const guardada = () =>
    em.save.mock.calls.find((c: unknown[]) => c[0] === RecurringExpense)?.[1] ??
    recurrenteRepo.save.mock.calls[0]?.[0];
  return { service, recurrenteRepo, dataSource, em, gastos, locks, consultas, guardada, filtrosNumeracion, fila: () => fila };
}

describe('RecurringExpensesService.actualizar — #16', () => {
  it('proveedor_id null guarda null, no undefined (undefined no toca la relación)', async () => {
    const t = armar(plantilla());
    await t.service.actualizar('r1', { proveedor_id: null });
    const guardado = t.guardada();
    expect(guardado.proveedor).toBeNull();
  });

  it('un proveedor nuevo se guarda como relación', async () => {
    const t = armar(plantilla());
    await t.service.actualizar('r1', { proveedor_id: 'prov-nuevo' });
    expect(t.guardada().proveedor).toEqual({ id: 'prov-nuevo' });
  });

  it('SEG-07: un proveedor que no es de la empresa (o no existe) no se asigna', async () => {
    const t = armar(plantilla());
    await expect(t.service.actualizar('r1', { proveedor_id: 'de-otro-taller' })).rejects.toThrow('Ese proveedor no existe.');
  });

  it('«Hasta» y notas en null se guardan en null', async () => {
    const t = armar(plantilla({ fecha_fin: '2027-12-31' as unknown as Date }));
    await t.service.actualizar('r1', { fecha_fin: null, notas: null });
    const guardado = t.guardada();
    expect(guardado.fecha_fin).toBeNull();
    expect(guardado.notas).toBeNull();
  });

  it('{} no toca nada', async () => {
    const original = plantilla();
    const t = armar(original);
    await t.service.actualizar('r1', {});
    const guardado = t.fila()!;
    expect(guardado.proveedor).toEqual({ id: 'prov-viejo', nombre: 'Inmobiliaria' });
    expect(guardado.notas).toBe('contrato 2026');
    expect(guardado.fecha_fin).toBeNull();
    expect(guardado.activo).toBe(true);
    expect(ymd(guardado.proxima_generacion)).toBe('2027-06-10');
  });

  it('las fechas del DTO (medianoche local) se guardan como el día que se eligió', async () => {
    const t = armar(plantilla());
    await t.service.actualizar('r1', { fecha_fin: new Date(2027, 9, 31) });
    expect(ymd(t.guardada().fecha_fin)).toBe('2027-10-31');
  });

  it('da NotFound si no existe', async () => {
    const t = armar(null);
    await expect(t.service.actualizar('nada', {})).rejects.toBeInstanceOf(NotFoundException);
  });
});

/** Sólo el reloj: las promesas y los timers siguen siendo los de verdad. */
function hoyEs(iso: string) {
  jest.useFakeTimers({
    doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'],
  });
  jest.setSystemTime(new Date(iso));
}

describe('RecurringExpensesService — terminar por «Hasta» y extenderlo (#42)', () => {
  afterEach(() => jest.useRealTimers());

  it('terminar por «Hasta» no la desactiva: genera hasta el fin y queda activa', async () => {
    hoyEs('2026-10-15T15:00:00Z');
    const t = armar(
      plantilla({
        proxima_generacion: '2026-10-10' as unknown as Date,
        fecha_fin: '2026-10-31' as unknown as Date,
      }),
    );
    const r = await t.service.generarPendientes();
    expect(r.generados).toBe(1);
    expect(t.gastos.map((g) => g.fecha)).toEqual(['2026-10-10']);
    expect(t.fila()!.activo).toBe(true);
    expect(ymd(t.fila()!.proxima_generacion)).toBe('2026-11-10');
  });

  it('una plantilla finalizada no abre transacción ni genera', async () => {
    hoyEs('2026-11-05T15:00:00Z');
    const t = armar(
      plantilla({
        proxima_generacion: '2026-11-10' as unknown as Date,
        fecha_fin: '2026-10-31' as unknown as Date,
      }),
    );
    const r = await t.service.generarPendientes();
    expect(r.generados).toBe(0);
    expect(t.dataSource.transaction).not.toHaveBeenCalled();
    expect(t.fila()!.activo).toBe(true);
  });

  it('extender «Hasta» crea el 10/11 en la misma llamada', async () => {
    hoyEs('2026-10-20T15:00:00Z');
    const t = armar(
      plantilla({
        proxima_generacion: '2026-11-10' as unknown as Date,
        fecha_fin: '2026-10-31' as unknown as Date,
      }),
    );
    const r = await t.service.actualizar('r1', { fecha_fin: new Date(2027, 9, 31) });
    expect(t.gastos.map((g) => g.fecha)).toEqual(['2026-11-10']);
    expect(ymd(r!.proxima_generacion)).toBe('2026-12-10');
    expect(r!.generados).toBe(6);
  });

  it('quitar «Hasta» también genera lo que ya cae en la ventana', async () => {
    hoyEs('2026-10-20T15:00:00Z');
    const t = armar(
      plantilla({
        proxima_generacion: '2026-11-10' as unknown as Date,
        fecha_fin: '2026-10-31' as unknown as Date,
      }),
    );
    await t.service.actualizar('r1', { fecha_fin: null });
    expect(t.gastos.map((g) => g.fecha)).toEqual(['2026-11-10']);
  });

  it('editar una dada de baja no genera', async () => {
    hoyEs('2026-10-20T15:00:00Z');
    const t = armar(plantilla({ proxima_generacion: '2026-11-10' as unknown as Date, activo: false }));
    await t.service.actualizar('r1', { monto: 1200 });
    expect(t.gastos).toEqual([]);
    // Una sola transacción: la de la edición. La de generar no se abre.
    expect(t.dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('editar una cuya próxima cae fuera de la ventana no genera', async () => {
    hoyEs('2026-10-01T15:00:00Z');
    const t = armar(plantilla({ proxima_generacion: '2026-12-10' as unknown as Date }));
    await t.service.actualizar('r1', { monto: 1200 });
    expect(t.dataSource.transaction).toHaveBeenCalledTimes(1);
  });
});

describe('RecurringExpensesService.reactivar (#42)', () => {
  afterEach(() => jest.useRealTimers());

  const dadaDeBaja = (p: Partial<RecurringExpense> = {}) =>
    plantilla({
      activo: false,
      proxima_generacion: '2026-07-10' as unknown as Date,
      ultima_generacion: '2026-06-10' as unknown as Date,
      ...p,
    });

  it("'pendiente' genera el hueco desde donde quedó, sin duplicar", async () => {
    hoyEs('2026-09-29T15:00:00Z');
    const t = armar(dadaDeBaja());
    const r = await t.service.reactivar('r1', 'pendiente');
    expect(r.activo).toBe(true);
    expect(t.gastos.map((g) => g.fecha)).toEqual(['2026-07-10', '2026-08-10', '2026-09-10', '2026-10-10']);
    expect(ymd(r.proxima_generacion)).toBe('2026-11-10');
  });

  it("'hoy' saltea lo vencido y retoma en el primer vencimiento desde hoy", async () => {
    hoyEs('2026-09-29T15:00:00Z');
    const t = armar(dadaDeBaja());
    const r = await t.service.reactivar('r1', 'hoy');
    expect(r.activo).toBe(true);
    expect(t.gastos.map((g) => g.fecha)).toEqual(['2026-10-10']);
    expect(ymd(r.proxima_generacion)).toBe('2026-11-10');
  });

  it("'hoy' es el día del taller: a las 21:30 de Argentina (00:30 UTC) sigue siendo hoy", async () => {
    hoyEs('2026-09-30T00:30:00Z');
    const t = armar(dadaDeBaja({ dia_vencimiento: 29, proxima_generacion: '2026-05-29' as unknown as Date }));
    await t.service.reactivar('r1', 'hoy');
    expect(t.gastos.map((g) => g.fecha)[0]).toBe('2026-09-29');
  });

  it('la segunda vez (doble clic) da 400 y no genera nada, con cualquier modo', async () => {
    hoyEs('2026-09-29T15:00:00Z');
    const t = armar(dadaDeBaja());
    await t.service.reactivar('r1', 'pendiente');
    const antes = t.gastos.length;
    await expect(t.service.reactivar('r1', 'pendiente')).rejects.toMatchObject({ status: 400 });
    await expect(t.service.reactivar('r1', 'hoy')).rejects.toMatchObject({ status: 400 });
    expect(t.gastos.length).toBe(antes);
    expect(ymd(t.fila()!.proxima_generacion)).toBe('2026-11-10');
  });

  it('una que terminó por «Hasta» queda activa pero no genera: hay que extender «Hasta»', async () => {
    hoyEs('2026-09-29T15:00:00Z');
    const t = armar(dadaDeBaja({ fecha_fin: '2026-06-30' as unknown as Date }));
    const r = await t.service.reactivar('r1', 'pendiente');
    expect(r.activo).toBe(true);
    expect(t.gastos).toEqual([]);
  });

  it('da NotFound si no existe', async () => {
    const t = armar(null);
    await expect(t.service.reactivar('nada', 'hoy')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('RecurringExpensesService — generación concurrente y numeración (revisión tanda 6)', () => {
  afterEach(() => jest.useRealTimers());

  it('dos corridas con la misma copia vieja: la segunda relee bajo lock, ve la próxima avanzada y no duplica', async () => {
    hoyEs('2026-09-29T15:00:00Z');
    const vieja = plantilla({ proxima_generacion: '2026-10-10' as unknown as Date });
    const t = armar(plantilla({ proxima_generacion: '2026-10-10' as unknown as Date }));
    // El cron y el botón leyeron la plantilla antes de que el otro guardara.
    t.recurrenteRepo.find.mockImplementation(async () => [Object.assign(new RecurringExpense(), vieja)]);

    await t.service.generarPendientes();
    await t.service.generarPendientes();

    expect(t.gastos.map((g) => g.fecha)).toEqual(['2026-10-10']);
    expect(t.locks).toContain('pessimistic_write');
    expect(ymd(t.fila()!.proxima_generacion)).toBe('2026-11-10');
    expect(t.fila()!.generados).toBe(6);
  });

  it('SEG-45: desde el cron, el correlativo se busca sólo entre los gastos del taller de la plantilla', async () => {
    hoyEs('2026-09-29T15:00:00Z');
    const t = armar(plantilla({ proxima_generacion: '2026-10-10' as unknown as Date }));
    await t.service.generarPendientes();
    expect(t.filtrosNumeracion).toContainEqual(['e.company_id = :empresaDelGasto', { empresaDelGasto: 'c1' }]);
  });

  it('si la dieron de baja entre la lectura y el lock, no genera', async () => {
    hoyEs('2026-09-29T15:00:00Z');
    const t = armar(plantilla({ proxima_generacion: '2026-10-10' as unknown as Date, activo: false }));
    t.recurrenteRepo.find.mockImplementation(async () => [
      plantilla({ proxima_generacion: '2026-10-10' as unknown as Date, activo: true }),
    ]);
    await t.service.generarPendientes();
    expect(t.gastos).toEqual([]);
  });

  it('el gasto generado conserva el proveedor aunque la relectura con lock no traiga relaciones', async () => {
    hoyEs('2026-09-29T15:00:00Z');
    const t = armar(plantilla({ proxima_generacion: '2026-10-10' as unknown as Date }));
    await t.service.generarPendientes();
    const gasto = t.em.save.mock.calls.find((c: unknown[]) => c[0] !== RecurringExpense)[1];
    expect(gasto.proveedor).toEqual({ id: 'prov-viejo', nombre: 'Inmobiliaria' });
  });

  it('crearGasto toma el lock de numeración con la misma clave que la recepción de OC', async () => {
    hoyEs('2026-09-29T15:00:00Z');
    const t = armar(plantilla({ proxima_generacion: '2026-10-10' as unknown as Date }));
    await t.service.generarPendientes();
    expect(t.consultas).toContainEqual(['SELECT pg_advisory_xact_lock(hashtext($1))', ['numero_gasto:GST-2026-']]);
  });
});

describe('RecurringExpensesService — la ventana cuenta días del taller (revisión tanda 6)', () => {
  afterEach(() => jest.useRealTimers());

  it('a las 9 de la mañana ya entra el vencimiento de dentro de 30 días', async () => {
    hoyEs('2026-09-29T12:00:00Z'); // 09:00 en Argentina
    const t = armar(plantilla({ proxima_generacion: '2026-10-29' as unknown as Date, dia_vencimiento: 29 }));
    await t.service.generarPendientes();
    expect(t.gastos.map((g) => g.fecha)).toEqual(['2026-10-29']);
  });

  it('a las 21:30 (00:30 UTC) el de dentro de 31 días todavía no entra', async () => {
    hoyEs('2026-09-30T00:30:00Z');
    const t = armar(plantilla({ proxima_generacion: '2026-10-30' as unknown as Date, dia_vencimiento: 30 }));
    await t.service.generarPendientes();
    expect(t.gastos).toEqual([]);
  });
});

describe('RecurringExpensesService.reactivar — sobre una activa (revisión tanda 6)', () => {
  it('da 400 con un mensaje claro y no toca nada', async () => {
    const t = armar(plantilla({ activo: true }));
    await expect(t.service.reactivar('r1', 'hoy')).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/ya está activo/),
    });
    expect(t.recurrenteRepo.save).not.toHaveBeenCalled();
  });
});

describe('RecurringExpensesService — editar y reactivar con la plantilla bloqueada (revisión tanda 6)', () => {
  afterEach(() => jest.useRealTimers());

  it('editar con una copia vieja no vuelve atrás la próxima que avanzó otra corrida', async () => {
    const t = armar(plantilla({ proxima_generacion: '2027-07-10' as unknown as Date, generados: 6 }));
    t.recurrenteRepo.findOne.mockImplementationOnce(async () =>
      plantilla({ proxima_generacion: '2027-06-10' as unknown as Date, generados: 5 }),
    );
    await t.service.actualizar('r1', { monto: 1200 });
    expect(ymd(t.fila()!.proxima_generacion)).toBe('2027-07-10');
    expect(t.fila()!.generados).toBe(6);
    expect(Number(t.fila()!.monto)).toBe(1200);
    expect(t.locks).toContain('pessimistic_write');
  });

  it("reactivar 'hoy' con una copia vieja no vuelve a generar lo que ya generó otra corrida", async () => {
    hoyEs('2026-09-29T15:00:00Z');
    const t = armar(plantilla({ activo: false, proxima_generacion: '2026-07-10' as unknown as Date }));
    const vieja = Object.assign(new RecurringExpense(), t.fila());
    await t.service.reactivar('r1', 'hoy');
    t.recurrenteRepo.findOne.mockImplementationOnce(async () => vieja);
    await t.service.reactivar('r1', 'hoy').catch(() => undefined);
    expect(t.gastos.map((g) => g.fecha)).toEqual(['2026-10-10']);
  });
});
