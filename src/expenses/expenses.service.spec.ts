import { BadRequestException } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { EstadoAprobacion, EstadoPagoGasto } from './entities/expense.entity';

/**
 * Un query builder que graba lo que se le pide y devuelve lo que se le
 * indique en los métodos finales. Sin base: se mira el SQL que arma el
 * servicio, como en `busqueda.service.spec.ts`.
 */
function qbGrabador(finales: Record<string, unknown> = {}) {
  const llamadas: { metodo: string; args: any[] }[] = [];
  const qb: any = new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === 'then') return undefined;
        if (prop in finales) return jest.fn(async () => finales[prop]);
        if (prop === 'llamadas') return llamadas;
        return (...args: any[]) => {
          llamadas.push({ metodo: prop, args });
          return qb;
        };
      },
    },
  );
  /** Todo el texto SQL que se le pasó, en orden. */
  const sql = () =>
    llamadas
      .flatMap((l) => l.args.filter((a) => typeof a === 'string'))
      .join(' \n ');
  /** Los parámetros con nombre que se le pasaron. */
  const params = () =>
    Object.assign(
      {},
      ...llamadas.flatMap((l) =>
        l.args.filter((a) => a && typeof a === 'object' && !Array.isArray(a)),
      ),
    );
  return { qb, llamadas, sql, params };
}

function armar() {
  const expenseRepository: any = {
    findOne: jest.fn(),
    save: jest.fn(async (e: any) => e),
    create: jest.fn((e: any) => e),
    createQueryBuilder: jest.fn(),
  };
  const userRepository: any = { findOneBy: jest.fn() };
  const proveedorRepository: any = { findOneBy: jest.fn() };
  const settingsRepository: any = { findOne: jest.fn(async () => null) };
  const em: any = {
    createQueryBuilder: jest.fn(),
    save: jest.fn(),
    create: jest.fn((_: any, x: any) => x),
  };
  const dataSource: any = {
    manager: { createQueryBuilder: jest.fn() },
    transaction: jest.fn(async (fn: any) => fn(em)),
  };
  const service = new ExpensesService(
    expenseRepository,
    {} as any,
    proveedorRepository,
    userRepository,
    settingsRepository,
    { registrar: jest.fn() } as any,
    dataSource,
  );
  // El recálculo del estado de pago tiene sus propios caminos; acá no importa.
  const recomputar = jest
    .spyOn(service as any, 'recomputarEstadoPago')
    .mockResolvedValue(undefined);
  return {
    service,
    expenseRepository,
    userRepository,
    dataSource,
    em,
    recomputar,
  };
}

// ═══════════════════════════════════════════════════════
// #8 — el total editado
// ═══════════════════════════════════════════════════════

describe('ExpensesService.update — el total sigue al desglose (#8)', () => {
  const guardado = () => ({
    id: 'g1',
    monto: '121.00',
    neto: '100.00',
    iva: '21.00',
    percepciones: '0.00',
    monto_pagado: '0.00',
    notas: 'viejo',
  });

  it('el caso del hallazgo: 121 editado a 200 + 42 queda en 242', async () => {
    const { service, expenseRepository } = armar();
    expenseRepository.findOne.mockResolvedValue(guardado());

    await service.update('g1', { neto: 200, iva: 42 });

    expect(expenseRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        monto: 242,
        neto: 200,
        iva: 42,
        percepciones: 0,
      }),
    );
  });

  it('con desglose, un total por debajo de lo pagado da 400 sin guardar', async () => {
    const { service, expenseRepository } = armar();
    expenseRepository.findOne.mockResolvedValue({
      ...guardado(),
      monto_pagado: '100.00',
    });

    await expect(
      service.update('g1', { neto: 50, iva: 10.5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(expenseRepository.save).not.toHaveBeenCalled();
  });

  it('con desglose, el total tiene que ser mayor a cero', async () => {
    const { service, expenseRepository } = armar();
    expenseRepository.findOne.mockResolvedValue(guardado());

    await expect(
      service.update('g1', { monto: 0, neto: 0, iva: 0, percepciones: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(expenseRepository.save).not.toHaveBeenCalled();
  });

  it('solo monto, por debajo de lo pagado, da 400', async () => {
    const { service, expenseRepository } = armar();
    expenseRepository.findOne.mockResolvedValue({
      ...guardado(),
      monto_pagado: '100.00',
    });

    await expect(service.update('g1', { monto: 99 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(expenseRepository.save).not.toHaveBeenCalled();
  });

  it('update({monto: 0}) con pagado 0 no falla: la nota de crédito total', async () => {
    const { service, expenseRepository } = armar();
    expenseRepository.findOne.mockResolvedValue(guardado());

    await service.update('g1', { monto: 0 });

    expect(expenseRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ monto: 0, neto: 0, iva: 0, percepciones: 0 }),
    );
  });

  it('solo monto sobre un gasto con IVA prorratea el desglose', async () => {
    const { service, expenseRepository } = armar();
    expenseRepository.findOne.mockResolvedValue(guardado());

    await service.update('g1', { monto: 60.5 });

    expect(expenseRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        monto: 60.5,
        neto: 50,
        iva: 10.5,
        percepciones: 0,
      }),
    );
  });

  it('editar solo las notas no toca los totales', async () => {
    const { service, expenseRepository } = armar();
    expenseRepository.findOne.mockResolvedValue(guardado());

    await service.update('g1', { notas: 'nuevo' });

    const guardadoAhora = expenseRepository.save.mock.calls[0][0];
    expect(guardadoAhora).toMatchObject({
      monto: '121.00',
      neto: '100.00',
      iva: '21.00',
      notas: 'nuevo',
    });
  });

  it('recalcula el estado de pago con el total nuevo', async () => {
    const { service, expenseRepository, recomputar } = armar();
    expenseRepository.findOne.mockResolvedValue(guardado());

    await service.update('g1', { neto: 200, iva: 42 });

    expect(recomputar).toHaveBeenCalledWith(expect.anything(), 'g1');
  });
});

describe('ExpensesService.create — totales del alta', () => {
  it('con desglose, el total es la suma aunque venga otro monto', async () => {
    const { service, expenseRepository, userRepository } = armar();
    userRepository.findOneBy.mockResolvedValue({ id: 'u1' });
    expenseRepository.createQueryBuilder.mockReturnValue(
      qbGrabador({ getOne: null }).qb,
    );

    await service.create({
      fecha: new Date('2026-09-01'),
      categoria: 'otro' as any,
      descripcion: 'x',
      metodo_pago: 'efectivo' as any,
      empleado_id: 'u1',
      monto: 1,
      neto: 100,
      iva: 21,
    });

    expect(expenseRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        monto: 121,
        neto: 100,
        iva: 21,
        percepciones: 0,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════
// #18 — la deuda que se puede pagar
// ═══════════════════════════════════════════════════════

describe('ExpensesService — qué gastos cuentan para cada número (#18)', () => {
  it('pagarProveedor: solo aprobados sin pagar, con el lock de siempre', async () => {
    const { service, em } = armar();
    const g = qbGrabador({ getMany: [] });
    em.createQueryBuilder.mockReturnValue(g.qb);

    await expect(
      service.pagarProveedor({
        proveedor_id: 'p1',
        monto: 100,
        wallet_id: 'w1',
      } as any),
    ).rejects.toThrow('El proveedor no tiene gastos pendientes de pago');

    expect(g.sql()).toContain('e.proveedor_id = :proveedorId');
    expect(g.sql()).toContain('e.estado = true');
    expect(g.sql()).toContain('e.estado_aprobacion = :dx_aprobado');
    expect(g.sql()).toContain('e.estado_pago != :dx_pagado');
    expect(g.params()).toMatchObject({
      dx_aprobado: EstadoAprobacion.APROBADO,
      dx_pagado: EstadoPagoGasto.PAGADO,
    });
    expect(g.llamadas).toContainEqual({
      metodo: 'setLock',
      args: ['pessimistic_write'],
    });
  });

  describe('cuentasPorPagar', () => {
    function conFilas(filas: any[]) {
      const ctx = armar();
      const gastos = qbGrabador({ getRawMany: filas });
      const anticipos = qbGrabador({ getRawMany: [] });
      ctx.expenseRepository.createQueryBuilder.mockReturnValue(gastos.qb);
      ctx.dataSource.manager.createQueryBuilder.mockReturnValue(anticipos.qb);
      return { ...ctx, gastos };
    }

    it('los rechazados no entran y los pendientes de firma van aparte', async () => {
      const { service, gastos } = conFilas([]);
      await service.cuentasPorPagar('c1');

      const sql = gastos.sql();
      expect(sql).toContain('e.estado = true');
      expect(sql).toContain('e.estado_aprobacion != :dx_rechazado');
      expect(sql).toContain('e.estado_pago != :dx_pagado');
      // Deuda y vencido: solo lo aprobado, que es lo que se puede pagar.
      expect(sql).toMatch(
        /CASE WHEN e\.estado_aprobacion = :cxp_aprobado THEN e\.monto - e\.monto_pagado ELSE 0 END.*deuda/s,
      );
      expect(sql).toContain('sin_aprobar');
      expect(sql).toContain('sin_aprobar_vencido');
      expect(gastos.llamadas).toContainEqual({
        metodo: 'setParameter',
        args: ['cxp_aprobado', EstadoAprobacion.APROBADO],
      });
    });

    it('sin_aprobar viaja aparte y el límite de crédito mira deuda + sin_aprobar', async () => {
      const { service } = conFilas([
        {
          proveedor_id: 'p1',
          proveedor: 'Repuestos SRL',
          limite_credito: '1000.00',
          comprobantes: '3',
          deuda: '600.00',
          vencido: '100.00',
          sin_aprobar: '500.00',
          sin_aprobar_vencido: '50.00',
          proximo_vencimiento: null,
        },
      ]);

      const [fila] = await service.cuentasPorPagar('c1');

      expect(fila).toMatchObject({
        deuda: 600,
        vencido: 100,
        sin_aprobar: 500,
        sin_aprobar_vencido: 50,
        excede_limite: true,
      });
    });

    it('con todo aprobado y bajo el límite no avisa', async () => {
      const { service } = conFilas([
        {
          proveedor_id: 'p1',
          proveedor: 'A',
          limite_credito: '1000',
          comprobantes: '1',
          deuda: '900',
          vencido: '0',
          sin_aprobar: '0',
          sin_aprobar_vencido: '0',
        },
      ]);
      const [fila] = await service.cuentasPorPagar();
      expect(fila.excede_limite).toBe(false);
      expect(fila.sin_aprobar).toBe(0);
    });
  });

  it('vencimientos: sin rechazados, y el pendiente de firma sale marcado', async () => {
    const { service, expenseRepository } = armar();
    const manana = new Date(Date.now() + 86_400_000);
    const g = qbGrabador({
      getMany: [
        {
          id: 'a',
          monto: '100',
          monto_pagado: '0',
          fecha_vencimiento: manana,
          estado_aprobacion: EstadoAprobacion.APROBADO,
        },
        {
          id: 'b',
          monto: '50',
          monto_pagado: '0',
          fecha_vencimiento: manana,
          estado_aprobacion: EstadoAprobacion.PENDIENTE,
        },
      ],
    });
    expenseRepository.createQueryBuilder.mockReturnValue(g.qb);

    const salida = await service.vencimientos(30, 'c1');

    expect(g.sql()).toContain('e.estado_aprobacion != :dx_rechazado');
    expect(g.sql()).toContain('e.estado_pago != :dx_pagado');
    const gastos = salida.proximo.gastos as any[];
    expect(gastos.find((x) => x.id === 'a').requiere_firma).toBe(false);
    expect(gastos.find((x) => x.id === 'b').requiere_firma).toBe(true);
  });

  describe('resumen', () => {
    function armarResumen() {
      const ctx = armar();
      const grabados: ReturnType<typeof qbGrabador>[] = [];
      ctx.expenseRepository.createQueryBuilder.mockImplementation(() => {
        const g = qbGrabador({
          getRawOne: { total: '10', cantidad: '1' },
          getRawMany: [],
        });
        grabados.push(g);
        return g.qb;
      });
      return { ...ctx, grabados };
    }

    it('un rechazado no suma en ninguna consulta, tampoco en el gasto del mes', async () => {
      const { service, grabados } = armarResumen();
      await service.resumen('c1');

      expect(grabados.length).toBeGreaterThan(0);
      for (const g of grabados) {
        expect(g.sql()).toContain('e.estado_aprobacion != :dx_rechazado');
      }
    });

    it('a pagar y vencido cuentan lo exigible; lo vencido sin firma va aparte', async () => {
      const { service, grabados } = armarResumen();
      const r = await service.resumen('c1');

      const vencidos = grabados.filter((g) =>
        g.sql().includes('e.fecha_vencimiento < CURRENT_DATE'),
      );
      expect(vencidos).toHaveLength(2);
      expect(
        vencidos.filter((g) => g.sql().includes(':dx_aprobado')),
      ).toHaveLength(1);
      expect(
        vencidos.filter(
          (g) => g.params().pendiente === EstadoAprobacion.PENDIENTE,
        ),
      ).toHaveLength(1);

      const aPagar = grabados.filter(
        (g) =>
          g.sql().includes(':dx_aprobado') &&
          !g.sql().includes('fecha_vencimiento'),
      );
      expect(aPagar).toHaveLength(1);
      expect(aPagar[0].sql()).toContain('e.estado_pago != :dx_pagado');

      expect(r.vencido_sin_aprobar).toEqual({ total: 10, cantidad: 1 });
    });
  });
});

describe('ExpensesService.update — el umbral se vuelve a mirar al subir el total', () => {
  const aprobado = (p: Record<string, unknown> = {}) => ({
    id: 'g1',
    companyId: 'c1',
    monto: '900.00',
    neto: '900.00',
    iva: '0.00',
    percepciones: '0.00',
    monto_pagado: '0.00',
    estado_aprobacion: EstadoAprobacion.APROBADO,
    aprobado_por: { id: 'jefe' },
    fecha_aprobacion: new Date('2026-09-01'),
    ...p,
  });

  function conUmbral(umbral: number, gasto: any) {
    const ctx = armar();
    ctx.expenseRepository.findOne.mockResolvedValue(gasto);
    (ctx.service as any).settingsRepository.findOne.mockResolvedValue({
      umbral_aprobacion: String(umbral),
    });
    return ctx;
  }

  it('sube y cruza el umbral: vuelve a esperar firma, aunque la hubiera firmado alguien', async () => {
    const { service, expenseRepository } = conUmbral(1000, aprobado());

    await service.update('g1', { monto: 50000 });

    const guardado = expenseRepository.save.mock.calls[0][0];
    expect(guardado.estado_aprobacion).toBe(EstadoAprobacion.PENDIENTE);
    expect(guardado.aprobado_por).toBeNull();
    expect(guardado.fecha_aprobacion).toBeNull();
  });

  it('sube sin cruzar el umbral: sigue aprobado', async () => {
    const { service, expenseRepository } = conUmbral(1000, aprobado());
    await service.update('g1', { monto: 950 });
    expect(expenseRepository.save.mock.calls[0][0].estado_aprobacion).toBe(
      EstadoAprobacion.APROBADO,
    );
  });

  it('baja el total: sigue aprobado, aunque siga arriba del umbral', async () => {
    const { service, expenseRepository } = conUmbral(
      1000,
      aprobado({ monto: '5000.00', neto: '5000.00' }),
    );
    await service.update('g1', { monto: 4000 });
    expect(expenseRepository.save.mock.calls[0][0].estado_aprobacion).toBe(
      EstadoAprobacion.APROBADO,
    );
  });

  it('con pagos parciales no se toca la aprobación', async () => {
    const { service, expenseRepository } = conUmbral(
      1000,
      aprobado({ monto_pagado: '100.00' }),
    );
    await service.update('g1', { monto: 50000 });
    expect(expenseRepository.save.mock.calls[0][0].estado_aprobacion).toBe(
      EstadoAprobacion.APROBADO,
    );
  });

  it('con umbral 0 nunca pide firma', async () => {
    const { service, expenseRepository } = conUmbral(0, aprobado());
    await service.update('g1', { monto: 50000 });
    expect(expenseRepository.save.mock.calls[0][0].estado_aprobacion).toBe(
      EstadoAprobacion.APROBADO,
    );
  });
});

describe('ExpensesService.update — un gasto en $0 por nota de crédito total', () => {
  it('se edita sin mandar monto: no valida totales y los deja en 0', async () => {
    const { service, expenseRepository } = armar();
    expenseRepository.findOne.mockResolvedValue({
      id: 'g1',
      monto: '0.00',
      neto: '0.00',
      iva: '0.00',
      percepciones: '0.00',
      monto_pagado: '0.00',
      estado_aprobacion: EstadoAprobacion.APROBADO,
    });

    await service.update('g1', {
      notas: 'NC total',
      descripcion: 'Motor devuelto',
    });

    expect(expenseRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        monto: '0.00',
        notas: 'NC total',
        descripcion: 'Motor devuelto',
      }),
    );
  });
});
