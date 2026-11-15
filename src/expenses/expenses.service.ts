import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { PagarGastoDto } from './dto/pagar-gasto.dto';
import { PagarProveedorDto } from './dto/pagar-proveedor.dto';
import { FiltrarGastosDto } from './dto/filtrar-gastos.dto';
import { Expense, EstadoPagoGasto, EstadoAprobacion } from './entities/expense.entity';
import { ExpensePayment } from './entities/expense-payment.entity';
import { SupplierAdvance } from './entities/supplier-advance.entity';
import { FinanceSettings } from '../finance/entities/finance-settings.entity';
import { Proveedor } from '../proveedores/entities/proveedore.entity';
import { User } from '../auth/entities/user.entity';
import { WalletLedgerService } from '../wallets/wallet-ledger.service';
import {
  OrigenMovimiento,
  SignoMovimiento,
} from '../wallets/entities/wallet-movement.entity';
import { siguienteCorrelativo } from '../common/numeracion.util';
import { inicioDelMesActual } from '../common/fechas.util';
import { totalesDeAlta, totalesDeEdicion } from './totales-gasto.util';
import {
  condicionDeudaAbierta,
  condicionDeudaExigible,
  condicionGastoVigente,
} from './deuda-exigible.util';

const dosDecimales = (n: number) => Number(Number(n).toFixed(2));

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(ExpensePayment)
    private readonly paymentRepository: Repository<ExpensePayment>,
    @InjectRepository(Proveedor)
    private readonly proveedorRepository: Repository<Proveedor>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(FinanceSettings)
    private readonly settingsRepository: Repository<FinanceSettings>,
    private readonly ledger: WalletLedgerService,
    private readonly dataSource: DataSource,
  ) {}

  /** Genera número de gasto único: GST-2026-0001 */
  private async generateNumeroGasto(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `GST-${year}-`;

    const lastExpense = await this.expenseRepository
      .createQueryBuilder('expense')
      .andWhere('expense.numero_gasto LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('LENGTH(expense.numero_gasto)', 'DESC')
      .addOrderBy('expense.numero_gasto', 'DESC')
      .getOne();

    return siguienteCorrelativo(prefix, lastExpense?.numero_gasto);
  }

  // ═══════════════════════════════════════════════════════
  // ALTA
  // ═══════════════════════════════════════════════════════

  async create(createExpenseDto: CreateExpenseDto) {
    const empleado = await this.userRepository.findOneBy({ id: createExpenseDto.empleado_id });
    if (!empleado) {
      throw new NotFoundException(`User with id "${createExpenseDto.empleado_id}" not found`);
    }

    let proveedor: Proveedor | undefined = undefined;
    if (createExpenseDto.proveedor_id) {
      proveedor =
        (await this.proveedorRepository.findOneBy({ id: createExpenseDto.proveedor_id })) ??
        undefined;
      if (!proveedor) {
        throw new NotFoundException(
          `Proveedor with id "${createExpenseDto.proveedor_id}" not found`,
        );
      }
    }

    const { empleado_id, proveedor_id, ...rest } = createExpenseDto;

    // El total manda. Si vino el desglose fiscal, el total se calcula desde él
    // en vez de confiar en dos números que podrían no coincidir.
    const { monto, neto, iva, percepciones } = totalesDeAlta(rest);

    if (!monto || monto <= 0) {
      throw new BadRequestException('El gasto debe tener un monto mayor a cero');
    }

    const numero_gasto = await this.generateNumeroGasto();

    const expense = this.expenseRepository.create({
      ...rest,
      numero_gasto,
      monto,
      neto,
      iva,
      percepciones,
      empleado,
      ...(proveedor ? { proveedor } : {}),
      // Sin vencimiento explícito se usa el plazo acordado con el proveedor.
      // Un gasto sin vencimiento no aparece en ninguna proyección de pagos.
      fecha_vencimiento:
        rest.fecha_vencimiento ?? this.vencimientoPorPlazo(rest.fecha, proveedor),
      estado_pago: EstadoPagoGasto.PENDIENTE,
      monto_pagado: 0,
      estado_aprobacion: await this.aprobacionInicial(monto, rest.companyId),
      created_at: new Date(),
    });

    return await this.expenseRepository.save(expense);
  }

  /**
   * Un gasto por encima del umbral de la empresa nace pendiente de aprobación.
   * Con umbral 0 —el valor por defecto— nace aprobado y el circuito no le
   * molesta a nadie que no lo haya pedido.
   */
  private async aprobacionInicial(
    monto: number,
    companyId?: string,
  ): Promise<EstadoAprobacion> {
    if (!companyId) return EstadoAprobacion.APROBADO;
    const settings = await this.settingsRepository.findOne({ where: { companyId } });
    const umbral = Number(settings?.umbral_aprobacion ?? 0);
    return umbral > 0 && monto >= umbral
      ? EstadoAprobacion.PENDIENTE
      : EstadoAprobacion.APROBADO;
  }

  /** Aprueba un gasto y lo habilita para pago. */
  async aprobar(id: string, aprobadorId: string) {
    const expense = await this.findOne(id);
    if (expense.estado_aprobacion === EstadoAprobacion.APROBADO) return expense;
    if (!expense.estado) throw new BadRequestException('El gasto está anulado');

    expense.estado_aprobacion = EstadoAprobacion.APROBADO;
    expense.aprobado_por = { id: aprobadorId } as never;
    expense.fecha_aprobacion = new Date();
    expense.motivo_rechazo = undefined;
    await this.expenseRepository.save(expense);
    return this.findOne(id);
  }

  async rechazar(id: string, aprobadorId: string, motivo: string) {
    const expense = await this.findOne(id);
    // Rechazar algo ya pagado dejaría la plata afuera sin explicación: primero
    // hay que anular el pago.
    if (Number(expense.monto_pagado) > 0) {
      throw new BadRequestException(
        'El gasto tiene pagos registrados. Anulá los pagos antes de rechazarlo.',
      );
    }

    expense.estado_aprobacion = EstadoAprobacion.RECHAZADO;
    expense.aprobado_por = { id: aprobadorId } as never;
    expense.fecha_aprobacion = new Date();
    expense.motivo_rechazo = motivo;
    await this.expenseRepository.save(expense);
    return this.findOne(id);
  }

  /** Los que esperan una firma. */
  async pendientesDeAprobacion(companyId?: string) {
    const qb = this.expenseRepository
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.proveedor', 'p')
      .where('e.estado = true')
      .andWhere('e.estado_aprobacion = :pendiente', {
        pendiente: EstadoAprobacion.PENDIENTE,
      })
      .orderBy('e.monto', 'DESC');

    if (companyId) qb.andWhere('e.company_id = :companyId', { companyId });
    return qb.getMany();
  }

  private vencimientoPorPlazo(fecha: Date | string, proveedor?: Proveedor): Date | undefined {
    if (!proveedor || !proveedor.dias_pago) return undefined;
    const base = new Date(fecha);
    base.setDate(base.getDate() + proveedor.dias_pago);
    return base;
  }

  // ═══════════════════════════════════════════════════════
  // CONSULTAS
  // ═══════════════════════════════════════════════════════

  /**
   * Los números que el dueño mira antes que la lista: cuánto se gastó este
   * mes, cuánto se debe, qué está vencido y qué espera una firma. Todo sale
   * de agregados sobre la misma tabla — nada que la lista no pudiera derivar,
   * pero derivarlo en el cliente obligaba a traer todos los gastos siempre.
   */
  async resumen(companyId?: string) {
    // (a) vigente: un gasto rechazado no se gastó, no suma en el mes ni en
    // ningún otro número de acá.
    const base = () => {
      const qb = condicionGastoVigente(this.expenseRepository.createQueryBuilder('e'));
      if (companyId) qb.andWhere('e.company_id = :companyId', { companyId });
      return qb;
    };

    // Arranque del mes en el calendario del TALLER. Con `toISOString()` el día
    // 1 después de las 21:00 daba el día 2, y los gastos cargados esa misma
    // noche quedaban fuera del resumen de su propio mes.
    const mesActual = inicioDelMesActual();

    const [mes, porCategoria, deuda, vencido, vencidoSinAprobar, aprobacion, ultimosMeses] =
      await Promise.all([
      base()
        .andWhere('e.fecha >= :mesActual', { mesActual })
        .select('COALESCE(SUM(e.monto), 0)', 'total')
        .addSelect('COUNT(e.id)', 'cantidad')
        .getRawOne<{ total: string; cantidad: string }>(),

      base()
        .andWhere('e.fecha >= :mesActual', { mesActual })
        .select('e.categoria', 'categoria')
        .addSelect('COALESCE(SUM(e.monto), 0)', 'total')
        .groupBy('e.categoria')
        .orderBy('total', 'DESC')
        .getRawMany<{ categoria: string; total: string }>(),

      // (b) exigible: lo que se puede pagar hoy.
      condicionDeudaExigible(base())
        .select('COALESCE(SUM(e.monto - e.monto_pagado), 0)', 'total')
        .addSelect('COUNT(e.id)', 'cantidad')
        .getRawOne<{ total: string; cantidad: string }>(),

      // Vencido también es exigible: antes sumaba los pendientes de firma,
      // que no se pueden pagar.
      condicionDeudaExigible(base())
        .andWhere('e.fecha_vencimiento < CURRENT_DATE')
        .select('COALESCE(SUM(e.monto - e.monto_pagado), 0)', 'total')
        .addSelect('COUNT(e.id)', 'cantidad')
        .getRawOne<{ total: string; cantidad: string }>(),

      // Lo vencido que espera una firma, aparte: se ve, pero no es deuda que
      // se pueda pagar hasta que alguien lo apruebe.
      base()
        .andWhere('e.estado_aprobacion = :pendiente', { pendiente: EstadoAprobacion.PENDIENTE })
        .andWhere('e.estado_pago != :pagado', { pagado: EstadoPagoGasto.PAGADO })
        .andWhere('e.fecha_vencimiento < CURRENT_DATE')
        .select('COALESCE(SUM(e.monto - e.monto_pagado), 0)', 'total')
        .addSelect('COUNT(e.id)', 'cantidad')
        .getRawOne<{ total: string; cantidad: string }>(),

      base()
        .andWhere('e.estado_aprobacion = :pendiente', { pendiente: EstadoAprobacion.PENDIENTE })
        .select('COALESCE(SUM(e.monto), 0)', 'total')
        .addSelect('COUNT(e.id)', 'cantidad')
        .getRawOne<{ total: string; cantidad: string }>(),

      base()
        .andWhere(`e.fecha >= CURRENT_DATE - INTERVAL '6 months'`)
        .select(`TO_CHAR(e.fecha, 'YYYY-MM')`, 'mes')
        .addSelect('COALESCE(SUM(e.monto), 0)', 'total')
        .groupBy('mes')
        .orderBy('mes', 'ASC')
        .getRawMany<{ mes: string; total: string }>(),
    ]);

    const totalMes = Number(mes?.total ?? 0);

    return {
      mes_actual: {
        total: dosDecimales(totalMes),
        cantidad: Number(mes?.cantidad ?? 0),
      },
      por_categoria: porCategoria.map((c) => ({
        categoria: c.categoria,
        total: dosDecimales(Number(c.total)),
        participacion: totalMes > 0 ? Math.round((Number(c.total) / totalMes) * 100) : 0,
      })),
      a_pagar: {
        total: dosDecimales(Number(deuda?.total ?? 0)),
        cantidad: Number(deuda?.cantidad ?? 0),
      },
      vencido: {
        total: dosDecimales(Number(vencido?.total ?? 0)),
        cantidad: Number(vencido?.cantidad ?? 0),
      },
      vencido_sin_aprobar: {
        total: dosDecimales(Number(vencidoSinAprobar?.total ?? 0)),
        cantidad: Number(vencidoSinAprobar?.cantidad ?? 0),
      },
      esperando_aprobacion: {
        total: dosDecimales(Number(aprobacion?.total ?? 0)),
        cantidad: Number(aprobacion?.cantidad ?? 0),
      },
      por_mes: ultimosMeses.map((m) => ({
        mes: m.mes,
        total: dosDecimales(Number(m.total)),
      })),
    };
  }

  async findAll(filtros: FiltrarGastosDto = {}) {
    const qb = this.expenseRepository
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.proveedor', 'proveedor')
      .orderBy('expense.fecha', 'DESC');

    if (filtros.companyId) {
      qb.andWhere('expense.company_id = :companyId', { companyId: filtros.companyId });
    }
    if (filtros.categoria) {
      qb.andWhere('expense.categoria = :categoria', { categoria: filtros.categoria });
    }
    if (filtros.estado_pago) {
      qb.andWhere('expense.estado_pago = :estadoPago', { estadoPago: filtros.estado_pago });
    }
    if (filtros.proveedor_id) {
      qb.andWhere('expense.proveedor_id = :proveedorId', { proveedorId: filtros.proveedor_id });
    }
    if (filtros.desde) {
      qb.andWhere('expense.fecha >= :desde', { desde: filtros.desde });
    }
    if (filtros.hasta) {
      qb.andWhere('expense.fecha <= :hasta', { hasta: filtros.hasta });
    }
    if (filtros.solo_activos !== false) {
      qb.andWhere('expense.estado = true');
    }
    if (filtros.vencidos) {
      qb.andWhere('expense.fecha_vencimiento < CURRENT_DATE').andWhere(
        'expense.estado_pago != :pagado',
        { pagado: EstadoPagoGasto.PAGADO },
      );
    }

    return qb.getMany();
  }

  async findOne(id: string) {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: ['pagos', 'pagos.wallet', 'proveedor'],
    });
    if (!expense) {
      throw new NotFoundException(`Expense with id "${id}" not found`);
    }
    return expense;
  }

  // ═══════════════════════════════════════════════════════
  // PAGOS
  // ═══════════════════════════════════════════════════════

  /**
   * Imputa un pago a un gasto y mueve la plata de verdad.
   *
   * Todo en una transacción: si el asiento del ledger falla, el pago no queda
   * registrado. Antes de esto, pagar un gasto no descontaba de ninguna cuenta.
   */
  async pagar(expenseId: string, dto: PagarGastoDto) {
    return this.dataSource.transaction(async (em: EntityManager) =>
      this.pagarCon(em, expenseId, dto),
    );
  }

  /**
   * Descuenta una nota de crédito del total de un gasto, sobre una
   * transacción AJENA (STK-02): la devolución al proveedor saca stock y baja
   * la deuda en un solo acto. Antes iba por `update()`, en otra transacción:
   * si la nota no entraba, el stock ya había salido.
   *
   * Misma regla de totales que la edición (el IVA y las percepciones se
   * prorratean). No deja el total por debajo de lo ya pagado.
   */
  async aplicarNotaDeCredito(em: EntityManager, expenseId: string, monto: number): Promise<void> {
    await this.bloquearGasto(em, expenseId);
    const expense = await em.findOne(Expense, { where: { id: expenseId } });
    if (!expense) throw new NotFoundException('Gasto inexistente');
    const nuevo = dosDecimales(Number(expense.monto) - Number(monto));
    if (nuevo < Number(expense.monto_pagado)) {
      throw new BadRequestException(`El total no puede quedar por debajo de lo ya pagado ($${expense.monto_pagado})`);
    }
    const totales = totalesDeEdicion(expense, { monto: nuevo });
    if (totales) {
      expense.monto = totales.monto;
      expense.neto = totales.neto;
      expense.iva = totales.iva;
      expense.percepciones = totales.percepciones;
      await em.save(Expense, expense);
    }
    await this.recomputarEstadoPago(em, expenseId);
  }

  /**
   * El cuerpo de pagar() sobre una transacción AJENA. Existe para el pago
   * contra entrega de las órdenes de compra: recepción y pago tienen que ser
   * un solo acto atómico — sin fondos en la billetera, la mercadería no
   * entra (ni stock, ni gasto, ni entrega). Un pago suelto usa pagar().
   */
  async pagarCon(em: EntityManager, expenseId: string, dto: PagarGastoDto) {
    {
      // `em.findOne(Expense, { lock: ... })` rompía con "500 Internal server
      // error" siempre — no es un caso borde, pasaba en cualquier pago. La
      // entidad Expense tiene relaciones `eager: true` (proveedor, empleado):
      // `findOne`/`find` las trae con LEFT JOIN automático aunque no se pidan,
      // y Postgres no permite `FOR UPDATE` sobre el lado nulable de un LEFT
      // JOIN ("proveedor" es opcional) — devuelve el error de Postgres
      // `0A000 / make_outerjoininfo`, que Nest traducía a un 500 genérico sin
      // pista de la causa real.
      //
      // El bloqueo pesimista solo necesita los campos propios del gasto
      // (monto, estado, aprobación), no sus relaciones, así que se arma con
      // el query builder — que a diferencia de find/findOne NUNCA hace join
      // automático a relaciones eager — en vez de pedir la entidad completa.
      const expense = await em
        .createQueryBuilder(Expense, 'expense')
        .where('expense.id = :id', { id: expenseId })
        .setLock('pessimistic_write')
        .getOne();
      if (!expense) throw new NotFoundException('Gasto inexistente');
      if (!expense.estado) {
        throw new BadRequestException('El gasto está anulado');
      }
      // El circuito de aprobación no sirve de nada si se puede pagar igual.
      if (expense.estado_aprobacion !== EstadoAprobacion.APROBADO) {
        throw new BadRequestException(
          expense.estado_aprobacion === EstadoAprobacion.RECHAZADO
            ? 'El gasto fue rechazado y no se puede pagar'
            : 'El gasto está pendiente de aprobación',
        );
      }

      const saldo = dosDecimales(Number(expense.monto) - Number(expense.monto_pagado));
      const monto = dosDecimales(dto.monto);

      if (monto <= 0) {
        throw new BadRequestException('El pago debe ser mayor a cero');
      }
      // Sin este tope se puede pagar dos veces el mismo gasto y el dinero sale
      // igual de la billetera, sin que nada lo señale.
      if (monto > saldo) {
        throw new BadRequestException(
          `El pago ($${monto}) supera el saldo pendiente del gasto ($${saldo})`,
        );
      }

      const movimiento = await this.ledger.registrar(
        {
          walletId: dto.wallet_id,
          signo: SignoMovimiento.EGRESO,
          monto,
          origen: OrigenMovimiento.PAGO_GASTO,
          origen_id: expense.id,
          concepto: `Pago ${expense.numero_gasto} · ${expense.descripcion}`.slice(0, 250),
          empleadoId: dto.empleado_id,
          companyId: expense.companyId,
        },
        em,
      );

      const pago = em.create(ExpensePayment, {
        expenseId: expense.id,
        monto,
        fecha_pago: dto.fecha_pago ?? new Date(),
        walletId: dto.wallet_id,
        metodo_pago: dto.metodo_pago,
        wallet_movement_id: movimiento.id,
        referencia: dto.referencia,
        notas: dto.notas,
        empleado: dto.empleado_id ? ({ id: dto.empleado_id } as never) : undefined,
        companyId: expense.companyId,
        activo: true,
      });
      const pagoGuardado = await em.save(ExpensePayment, pago);

      await this.recomputarEstadoPago(em, expense.id);

      return em.findOne(Expense, {
        where: { id: expense.id },
        relations: ['pagos', 'pagos.wallet', 'proveedor'],
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // ANTICIPOS A PROVEEDOR
  // ═══════════════════════════════════════════════════════

  /**
   * "Le dejo $50.000 a cuenta": la plata sale de la caja AHORA (con asiento
   * y chequeo de fondos) y queda como saldo a favor. Las próximas facturas
   * lo consumen primero, antes de tocar la caja de nuevo.
   */
  async crearAnticipo(dto: {
    proveedor_id: string;
    monto: number;
    wallet_id: string;
    notas?: string;
    empleado_id?: string;
    companyId?: string;
  }) {
    return this.dataSource.transaction(async (em: EntityManager) => {
      const proveedor = await em.findOne(Proveedor, { where: { id: dto.proveedor_id } });
      if (!proveedor) throw new NotFoundException('Proveedor inexistente');

      const monto = dosDecimales(dto.monto);
      if (monto <= 0) throw new BadRequestException('El anticipo debe ser mayor a cero');

      const movimiento = await this.ledger.registrar(
        {
          walletId: dto.wallet_id,
          signo: SignoMovimiento.EGRESO,
          monto,
          origen: OrigenMovimiento.ANTICIPO_PROVEEDOR,
          origen_id: proveedor.id,
          concepto: `Anticipo a ${proveedor.nombre}${dto.notas ? ' · ' + dto.notas : ''}`.slice(0, 250),
          empleadoId: dto.empleado_id,
          companyId: dto.companyId,
        },
        em,
      );

      return em.save(
        SupplierAdvance,
        em.create(SupplierAdvance, {
          proveedorId: proveedor.id,
          monto,
          saldo: monto,
          walletId: dto.wallet_id,
          wallet_movement_id: movimiento.id,
          notas: dto.notas,
          empleado: dto.empleado_id ? ({ id: dto.empleado_id } as never) : undefined,
          companyId: dto.companyId,
          activo: true,
        }),
      );
    });
  }

  /**
   * Anula un anticipo cargado por error. Solo si no se consumió nada:
   * con imputaciones encima, primero se anulan esos pagos (que devuelven
   * el saldo) y recién después se puede anular el anticipo.
   */
  async anularAnticipo(anticipoId: string, motivo?: string, destino?: 'turno_actual' | 'sin_arqueo') {
    return this.dataSource.transaction(async (em: EntityManager) => {
      const anticipo = await em
        .createQueryBuilder(SupplierAdvance, 'a')
        .where('a.id = :id', { id: anticipoId })
        .setLock('pessimistic_write')
        .getOne();
      if (!anticipo) throw new NotFoundException('Anticipo inexistente');
      if (!anticipo.activo) throw new BadRequestException('El anticipo ya está anulado');
      if (Number(anticipo.saldo) !== Number(anticipo.monto)) {
        throw new BadRequestException(
          'El anticipo tiene imputaciones: anulá primero esos pagos para que el saldo vuelva',
        );
      }

      // La plata vuelve a la caja de la que salió, con el asiento contrario.
      if (anticipo.wallet_movement_id) {
        await this.ledger.revertir(
          anticipo.wallet_movement_id,
          `Anulación de anticipo${motivo ? ' · ' + motivo : ''}`,
          em,
          destino,
        );
      }

      anticipo.activo = false;
      anticipo.saldo = 0;
      anticipo.notas = [anticipo.notas, motivo ? `Anulado: ${motivo}` : 'Anulado']
        .filter(Boolean)
        .join(' | ');
      return em.save(SupplierAdvance, anticipo);
    });
  }

  /**
   * Bloquea la fila del gasto (QueryBuilder sin relaciones: el gasto tiene
   * relaciones eager y `findOne` + lock rompe con FOR UPDATE). Es el primer
   * candado de toda anulación, así dos anulaciones del mismo gasto o de sus
   * pagos se ponen en fila en vez de pisarse (PLA-03).
   */
  private async bloquearGasto(em: EntityManager, id: string): Promise<Expense | null> {
    return em
      .createQueryBuilder(Expense, 'e')
      .where('e.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
  }

  /** Reintegra al anticipo lo que una anulación le devuelve. */
  private async devolverAAnticipo(em: EntityManager, anticipoId: string, monto: number) {
    // QueryBuilder a propósito: la entidad tiene relaciones eager y
    // findOne + lock genera LEFT JOIN + FOR UPDATE, que Postgres rechaza.
    const anticipo = await em
      .createQueryBuilder(SupplierAdvance, 'a')
      .where('a.id = :id', { id: anticipoId })
      .setLock('pessimistic_write')
      .getOne();
    if (!anticipo) return; // no hay a dónde devolver
    anticipo.saldo = dosDecimales(Number(anticipo.saldo) + monto);
    await em.save(SupplierAdvance, anticipo);
  }

  /** Anticipos con saldo de un proveedor, el más viejo primero (se consumen así). */
  async anticiposDe(proveedorId: string) {
    const anticipos = await this.dataSource.manager.find(SupplierAdvance, {
      where: { proveedorId, activo: true },
      order: { created_at: 'ASC' },
    });
    const conSaldo = anticipos.filter((a) => Number(a.saldo) > 0);
    return {
      disponible: dosDecimales(conSaldo.reduce((s, a) => s + Number(a.saldo), 0)),
      anticipos: conSaldo,
    };
  }

  /**
   * Paga a un proveedor con imputación FIFO.
   *
   * Así se paga en la realidad: "le doy $200.000 a Bebidas SRL", no factura
   * por factura. El monto se aplica a los comprobantes pendientes del
   * proveedor en orden de vencimiento (el más viejo primero; sin vencimiento
   * van al final, por fecha). Todo en una transacción: cada imputación genera
   * su ExpensePayment con su asiento en el ledger — que hace el chequeo de
   * fondos — así cada pago se puede anular después individualmente.
   */
  async pagarProveedor(dto: PagarProveedorDto) {
    return this.dataSource.transaction(async (em: EntityManager) => {
      const monto = dosDecimales(dto.monto);

      // Lock pesimista sobre los gastos del proveedor: dos pagos simultáneos
      // no pueden imputar sobre los mismos saldos. QueryBuilder a propósito
      // (las relaciones eager rompen FOR UPDATE, ver pagar()).
      const gastos = await condicionDeudaExigible(
        em
          .createQueryBuilder(Expense, 'e')
          .where('e.proveedor_id = :proveedorId', { proveedorId: dto.proveedor_id }),
      )
        .orderBy('e.fecha_vencimiento', 'ASC', 'NULLS LAST')
        .addOrderBy('e.fecha', 'ASC')
        .setLock('pessimistic_write')
        .getMany();

      if (!gastos.length) {
        throw new BadRequestException('El proveedor no tiene gastos pendientes de pago');
      }

      const deudaTotal = dosDecimales(
        gastos.reduce((s, g) => s + Number(g.monto) - Number(g.monto_pagado), 0),
      );
      // Pagar de más dejaría plata imputada a nada. Si hay un adelanto real,
      // eso es otro concepto (anticipo), no un pago de comprobantes.
      if (monto > deudaTotal) {
        throw new BadRequestException(
          `El pago ($${monto}) supera la deuda del proveedor ($${deudaTotal})`,
        );
      }

      // Anticipos con saldo, lockeados: se consumen ANTES que la caja. La
      // plata del anticipo ya salió cuando se entregó — imputarla acá no
      // genera movimiento nuevo, solo baja el saldo a favor.
      const anticipos =
        dto.usar_anticipos === false
          ? []
          : await em
              .createQueryBuilder(SupplierAdvance, 'a')
              .where('a.proveedor_id = :proveedorId', { proveedorId: dto.proveedor_id })
              .andWhere('a.activo = true')
              .andWhere('a.saldo > 0')
              .orderBy('a.created_at', 'ASC')
              .setLock('pessimistic_write')
              .getMany();

      let restante = monto;
      let desdeAnticipos = 0;
      const imputaciones: { numero_gasto: string; aplicado: number; saldado: boolean }[] = [];

      for (const gasto of gastos) {
        if (restante <= 0) break;

        const saldo = dosDecimales(Number(gasto.monto) - Number(gasto.monto_pagado));
        let aplicar = dosDecimales(Math.min(saldo, restante));
        if (aplicar <= 0) continue;
        const aplicadoAlGasto = aplicar;

        // 1) Primero el saldo a favor.
        for (const anticipo of anticipos) {
          if (aplicar <= 0) break;
          const disponible = dosDecimales(Number(anticipo.saldo));
          if (disponible <= 0) continue;

          const usar = dosDecimales(Math.min(disponible, aplicar));
          anticipo.saldo = dosDecimales(disponible - usar);
          await em.save(SupplierAdvance, anticipo);

          await em.save(
            ExpensePayment,
            em.create(ExpensePayment, {
              expenseId: gasto.id,
              monto: usar,
              fecha_pago: new Date(),
              // La caja de la que salió el anticipo en su momento: el rastro
              // del dinero apunta a donde realmente estuvo.
              walletId: anticipo.walletId,
              metodo_pago: dto.metodo_pago,
              referencia: dto.referencia,
              supplier_advance_id: anticipo.id,
              notas: `Imputado desde anticipo del ${String(anticipo.created_at).slice(0, 10)}`,
              empleado: dto.empleado_id ? ({ id: dto.empleado_id } as never) : undefined,
              companyId: gasto.companyId,
              activo: true,
            }),
          );

          desdeAnticipos = dosDecimales(desdeAnticipos + usar);
          aplicar = dosDecimales(aplicar - usar);
        }

        // 2) El resto sale de la caja elegida, con su asiento y su chequeo.
        if (aplicar > 0) {
          const movimiento = await this.ledger.registrar(
            {
              walletId: dto.wallet_id,
              signo: SignoMovimiento.EGRESO,
              monto: aplicar,
              origen: OrigenMovimiento.PAGO_GASTO,
              origen_id: gasto.id,
              concepto: `Pago ${gasto.numero_gasto} · ${gasto.descripcion}`.slice(0, 250),
              empleadoId: dto.empleado_id,
              companyId: gasto.companyId,
            },
            em,
          );

          await em.save(
            ExpensePayment,
            em.create(ExpensePayment, {
              expenseId: gasto.id,
              monto: aplicar,
              fecha_pago: new Date(),
              walletId: dto.wallet_id,
              metodo_pago: dto.metodo_pago,
              wallet_movement_id: movimiento.id,
              referencia: dto.referencia,
              notas: 'Imputación automática de pago al proveedor',
              empleado: dto.empleado_id ? ({ id: dto.empleado_id } as never) : undefined,
              companyId: gasto.companyId,
              activo: true,
            }),
          );
        }

        await this.recomputarEstadoPago(em, gasto.id);
        restante = dosDecimales(restante - aplicadoAlGasto);
        imputaciones.push({
          numero_gasto: gasto.numero_gasto,
          aplicado: aplicadoAlGasto,
          saldado: aplicadoAlGasto >= saldo,
        });
      }

      return {
        total_aplicado: dosDecimales(monto - restante),
        desde_anticipos: desdeAnticipos,
        desde_caja: dosDecimales(monto - restante - desdeAnticipos),
        comprobantes_tocados: imputaciones.length,
        comprobantes_saldados: imputaciones.filter((i) => i.saldado).length,
        deuda_restante: dosDecimales(deudaTotal - (monto - restante)),
        imputaciones,
      };
    });
  }

  /**
   * Anula un pago: escribe el asiento contrario en el ledger y recalcula el
   * estado del gasto. El pago no se borra — queda inactivo, con su rastro.
   */
  async anularPago(pagoId: string, motivo?: string, destino?: 'turno_actual' | 'sin_arqueo') {
    return this.dataSource.transaction(async (em: EntityManager) => {
      // PLA-03: anular el pago y el gasto a la vez (o un doble clic)
      // revertía dos veces el mismo egreso. Se bloquea primero el GASTO y
      // después el pago —el mismo orden que `anular`, para no cruzarse en un
      // deadlock— y recién con el lock se mira si el pago sigue activo.
      const ref = await em
        .createQueryBuilder(ExpensePayment, 'p')
        .select(['p.id', 'p.expenseId'])
        .where('p.id = :id', { id: pagoId })
        .getOne();
      if (!ref) throw new NotFoundException('Pago inexistente');
      await this.bloquearGasto(em, ref.expenseId);
      const pago = await em
        .createQueryBuilder(ExpensePayment, 'p')
        .where('p.id = :id', { id: pagoId })
        .setLock('pessimistic_write')
        .getOne();
      if (!pago) throw new NotFoundException('Pago inexistente');
      if (!pago.activo) throw new BadRequestException('El pago ya estaba anulado');

      if (pago.wallet_movement_id) {
        await this.ledger.revertir(
          pago.wallet_movement_id,
          `Anulación de pago${motivo ? ' · ' + motivo : ''}`,
          em,
          destino,
        );
      }

      // Si salió de un anticipo, la plata vuelve al saldo a favor — no a la
      // caja, porque de la caja no salió en ese momento.
      if (pago.supplier_advance_id) {
        await this.devolverAAnticipo(em, pago.supplier_advance_id, Number(pago.monto));
      }

      pago.activo = false;
      pago.notas = [pago.notas, motivo ? `Anulado: ${motivo}` : 'Anulado']
        .filter(Boolean)
        .join(' | ');
      await em.save(ExpensePayment, pago);

      await this.recomputarEstadoPago(em, pago.expenseId);

      return em.findOne(Expense, {
        where: { id: pago.expenseId },
        relations: ['pagos', 'pagos.wallet', 'proveedor'],
      });
    });
  }

  /**
   * Recalcula monto_pagado y estado_pago desde los pagos activos.
   *
   * Se recalcula en vez de incrementar: un contador que se suma a mano se
   * desincroniza en cuanto una operación falla a mitad de camino.
   */
  private async recomputarEstadoPago(em: EntityManager, expenseId: string): Promise<void> {
    const fila = await em
      .createQueryBuilder(ExpensePayment, 'p')
      .select('COALESCE(SUM(p.monto), 0)', 'total')
      .where('p.expense_id = :expenseId', { expenseId })
      .andWhere('p.activo = true')
      .getRawOne<{ total: string }>();

    const pagado = dosDecimales(Number(fila?.total ?? 0));
    const expense = await em.findOneOrFail(Expense, { where: { id: expenseId } });
    const total = dosDecimales(Number(expense.monto));

    expense.monto_pagado = pagado;
    expense.estado_pago =
      pagado <= 0
        ? EstadoPagoGasto.PENDIENTE
        : pagado >= total
          ? EstadoPagoGasto.PAGADO
          : EstadoPagoGasto.PARCIAL;

    await em.save(Expense, expense);
  }

  // ═══════════════════════════════════════════════════════
  // CUENTAS POR PAGAR
  // ═══════════════════════════════════════════════════════

  /**
   * Cuánto se le debe a cada proveedor, y cuánto de eso está vencido.
   *
   * Deuda y vencido son lo APROBADO: lo que se puede pagar y lo que precarga
   * el pago al proveedor. Antes sumaban los rechazados y los pendientes de
   * firma, y pagar ese número por fuera o con anticipo pagaba facturas
   * rechazadas. Lo que espera una firma va aparte (`sin_aprobar`), para que
   * se siga viendo lo que se viene.
   */
  async cuentasPorPagar(companyId?: string) {
    const qb = condicionDeudaAbierta(
      this.expenseRepository
        .createQueryBuilder('e')
        .leftJoin('e.proveedor', 'p')
        .select('p.id', 'proveedor_id')
        .addSelect('p.nombre', 'proveedor')
        .addSelect('p.limite_credito', 'limite_credito')
        .addSelect('COUNT(e.id)', 'comprobantes')
        .addSelect(
          'COALESCE(SUM(CASE WHEN e.estado_aprobacion = :cxp_aprobado THEN e.monto - e.monto_pagado ELSE 0 END), 0)',
          'deuda',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN e.estado_aprobacion = :cxp_aprobado AND e.fecha_vencimiento < CURRENT_DATE THEN e.monto - e.monto_pagado ELSE 0 END), 0)',
          'vencido',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN e.estado_aprobacion != :cxp_aprobado THEN e.monto - e.monto_pagado ELSE 0 END), 0)',
          'sin_aprobar',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN e.estado_aprobacion != :cxp_aprobado AND e.fecha_vencimiento < CURRENT_DATE THEN e.monto - e.monto_pagado ELSE 0 END), 0)',
          'sin_aprobar_vencido',
        )
        .addSelect('MIN(e.fecha_vencimiento)', 'proximo_vencimiento')
        .setParameter('cxp_aprobado', EstadoAprobacion.APROBADO),
    )
      .groupBy('p.id')
      .addGroupBy('p.nombre')
      .addGroupBy('p.limite_credito')
      .orderBy('deuda', 'DESC');

    if (companyId) qb.andWhere('e.company_id = :companyId', { companyId });

    const filas = await qb.getRawMany();

    // Saldo a favor por proveedor, para mostrar "a cuenta" al lado de la
    // deuda: la deuda real contra un proveedor es deuda − anticipos.
    const anticipos = await this.dataSource.manager
      .createQueryBuilder(SupplierAdvance, 'a')
      .select('a.proveedor_id', 'proveedor_id')
      .addSelect('COALESCE(SUM(a.saldo), 0)', 'a_cuenta')
      .where('a.activo = true')
      .andWhere('a.saldo > 0')
      .groupBy('a.proveedor_id')
      .getRawMany();
    const aCuentaDe = new Map(anticipos.map((a) => [a.proveedor_id, Number(a.a_cuenta)]));

    const resultado = filas.map((f) => ({
      proveedor_id: f.proveedor_id,
      proveedor: f.proveedor ?? 'Sin proveedor',
      comprobantes: Number(f.comprobantes),
      deuda: dosDecimales(Number(f.deuda)),
      vencido: dosDecimales(Number(f.vencido)),
      sin_aprobar: dosDecimales(Number(f.sin_aprobar ?? 0)),
      sin_aprobar_vencido: dosDecimales(Number(f.sin_aprobar_vencido ?? 0)),
      proximo_vencimiento: f.proximo_vencimiento,
      limite_credito: dosDecimales(Number(f.limite_credito ?? 0)),
      a_cuenta: dosDecimales(aCuentaDe.get(f.proveedor_id) ?? 0),
      // Aviso, no bloqueo: un proveedor no deja de entregar porque el sistema
      // diga que se pasó del límite. Cuenta lo que espera firma: es crédito
      // que el proveedor ya dio.
      excede_limite:
        Number(f.limite_credito ?? 0) > 0 &&
        Number(f.deuda) + Number(f.sin_aprobar ?? 0) > Number(f.limite_credito),
    }));

    // Un proveedor al que le dimos plata a cuenta y no le debemos nada no
    // aparece en la agrupación de gastos, pero esa plata entregada tiene que
    // verse en la misma tabla: es un crédito nuestro contra él.
    const listados = new Set(resultado.map((r) => r.proveedor_id));
    const soloAnticipo = anticipos.filter((a) => !listados.has(a.proveedor_id));
    if (soloAnticipo.length) {
      const provs = await this.dataSource.manager
        .createQueryBuilder(Proveedor, 'p')
        .where('p.id IN (:...ids)', { ids: soloAnticipo.map((a) => a.proveedor_id) })
        .getMany();
      const nombreDe = new Map(provs.map((p) => [p.id, p.nombre]));
      for (const a of soloAnticipo) {
        resultado.push({
          proveedor_id: a.proveedor_id,
          proveedor: nombreDe.get(a.proveedor_id) ?? 'Proveedor',
          comprobantes: 0,
          deuda: 0,
          vencido: 0,
          sin_aprobar: 0,
          sin_aprobar_vencido: 0,
          proximo_vencimiento: null,
          limite_credito: 0,
          a_cuenta: dosDecimales(Number(a.a_cuenta)),
          excede_limite: false,
        });
      }
    }

    return resultado;
  }

  /**
   * Qué vence y cuándo, agrupado por tramo. Es la vista que contesta
   * "¿qué tengo que pagar esta semana?".
   */
  async vencimientos(dias = 30, companyId?: string) {
    // (c) abierta: los pendientes de firma se ven (los gastos fijos se generan
    // antes de vencer), pero marcados; los rechazados no.
    const qb = condicionDeudaAbierta(
      this.expenseRepository.createQueryBuilder('e').leftJoinAndSelect('e.proveedor', 'p'),
    )
      .andWhere('e.fecha_vencimiento IS NOT NULL')
      .orderBy('e.fecha_vencimiento', 'ASC');

    if (companyId) qb.andWhere('e.company_id = :companyId', { companyId });

    const gastos = await qb.getMany();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const limite = new Date(hoy);
    limite.setDate(limite.getDate() + dias);

    const tramo = (venc: Date) => {
      const v = new Date(venc);
      v.setHours(0, 0, 0, 0);
      if (v < hoy) return 'vencido';
      if (v.getTime() === hoy.getTime()) return 'hoy';
      if (v <= limite) return 'proximo';
      return 'futuro';
    };

    const salida: Record<string, { total: number; gastos: unknown[] }> = {
      vencido: { total: 0, gastos: [] },
      hoy: { total: 0, gastos: [] },
      proximo: { total: 0, gastos: [] },
      futuro: { total: 0, gastos: [] },
    };

    for (const g of gastos) {
      const pendiente = dosDecimales(Number(g.monto) - Number(g.monto_pagado));
      const t = tramo(g.fecha_vencimiento as Date);
      salida[t].total = dosDecimales(salida[t].total + pendiente);
      salida[t].gastos.push({
        id: g.id,
        numero_gasto: g.numero_gasto,
        descripcion: g.descripcion,
        proveedor: g.proveedor?.nombre ?? null,
        fecha_vencimiento: g.fecha_vencimiento,
        total: dosDecimales(Number(g.monto)),
        pendiente,
        // No se puede pagar hasta que lo aprueben: pagar() lo rechaza.
        requiere_firma: g.estado_aprobacion === EstadoAprobacion.PENDIENTE,
      });
    }

    return salida;
  }

  // ═══════════════════════════════════════════════════════
  // EDICIÓN Y BAJA
  // ═══════════════════════════════════════════════════════

  async update(id: string, updateExpenseDto: UpdateExpenseDto) {
    const expense = await this.findOne(id);

    // El total sale de la misma regla que en el alta. Antes el desglose se
    // copiaba encima y el monto quedaba el viejo: se pagaba de más o
    // desaparecía deuda.
    const totales = totalesDeEdicion(expense, updateExpenseDto);
    if (totales) {
      // Con desglose el total es la suma y tiene que ser un gasto de verdad.
      // Con solo monto se permite 0: la nota de crédito total de una
      // devolución lo deja así, con el stock ya movido (devoluciones.service).
      if (totales.rama === 'desglose' && totales.monto <= 0) {
        throw new BadRequestException('El gasto debe tener un monto mayor a cero');
      }
      // Cambiar el total por debajo de lo ya pagado dejaría el gasto en un
      // estado imposible: pagado de más, sin forma de explicar la diferencia.
      if (totales.monto < Number(expense.monto_pagado)) {
        throw new BadRequestException(
          `El total no puede quedar por debajo de lo ya pagado ($${expense.monto_pagado})`,
        );
      }
    }

    // Subir el total por encima del umbral vuelve a pedir firma. Si no, un
    // gasto cargado en $900 (nace aprobado) y editado a $50.000 quedaba
    // pagable sin que nadie lo firmara. Vale aunque ya lo hubieran firmado:
    // la firma fue por el monto viejo. Con pagos hechos no se toca (quedaría
    // pagado en parte y sin poder completarse).
    const requiereFirmaDeNuevo =
      !!totales &&
      expense.estado_aprobacion === EstadoAprobacion.APROBADO &&
      Number(expense.monto_pagado) <= 0 &&
      totales.monto > Number(expense.monto) &&
      (await this.aprobacionInicial(totales.monto, expense.companyId)) ===
        EstadoAprobacion.PENDIENTE;

    if (updateExpenseDto.empleado_id) {
      const empleado = await this.userRepository.findOneBy({ id: updateExpenseDto.empleado_id });
      if (!empleado) {
        throw new NotFoundException(`User with id "${updateExpenseDto.empleado_id}" not found`);
      }
      expense.empleado = empleado;
    }

    if (updateExpenseDto.proveedor_id) {
      const proveedor = await this.proveedorRepository.findOneBy({
        id: updateExpenseDto.proveedor_id,
      });
      if (!proveedor) {
        throw new NotFoundException(
          `Proveedor with id "${updateExpenseDto.proveedor_id}" not found`,
        );
      }
      expense.proveedor = proveedor;
    }

    // Los totales no se copian del DTO: se asignan ya calculados.
    const { empleado_id, proveedor_id, monto, neto, iva, percepciones, ...rest } =
      updateExpenseDto;
    Object.assign(expense, rest);
    if (totales) {
      expense.monto = totales.monto;
      expense.neto = totales.neto;
      expense.iva = totales.iva;
      expense.percepciones = totales.percepciones;
    }
    if (requiereFirmaDeNuevo) {
      expense.estado_aprobacion = EstadoAprobacion.PENDIENTE;
      expense.aprobado_por = null as never;
      expense.fecha_aprobacion = null as never;
    }

    const guardado = await this.expenseRepository.save(expense);
    await this.recomputarEstadoPago(this.dataSource.manager, guardado.id);
    return this.findOne(guardado.id);
  }

  /**
   * Anula el gasto. Si tenía pagos, se revierten primero: la plata vuelve a la
   * billetera. Anular sin devolver el dinero dejaría el saldo mintiendo.
   */
  async anular(id: string, motivo?: string, destino?: 'turno_actual' | 'sin_arqueo') {
    return this.dataSource.transaction(async (em: EntityManager) => {
      // PLA-03: el gasto se bloquea antes de mirar nada (dos anulaciones a la
      // vez, o una del gasto y otra de un pago suyo, revertían dos veces) y
      // los pagos se leen con lock, en el mismo orden que `anularPago`.
      if (!(await this.bloquearGasto(em, id))) throw new NotFoundException('Gasto inexistente');
      const expense = await em.findOne(Expense, { where: { id }, relations: ['pagos'] });
      if (!expense) throw new NotFoundException('Gasto inexistente');
      if (!expense.estado) return expense;
      const pagos = await em
        .createQueryBuilder(ExpensePayment, 'p')
        .where('p.expense_id = :id', { id })
        .setLock('pessimistic_write')
        .getMany();

      for (const pago of pagos) {
        if (!pago.activo) continue;
        if (pago.wallet_movement_id) {
          await this.ledger.revertir(
            pago.wallet_movement_id,
            `Anulación de gasto ${expense.numero_gasto}`,
            em,
            destino,
          );
        }
        // Lo que salió de un anticipo vuelve al anticipo, no a la caja.
        if (pago.supplier_advance_id) {
          await this.devolverAAnticipo(em, pago.supplier_advance_id, Number(pago.monto));
        }
        pago.activo = false;
        await em.save(ExpensePayment, pago);
      }

      // La respuesta muestra los pagos como quedaron (el ERP los lista).
      const anulados = new Set(pagos.map((p) => p.id));
      for (const p of expense.pagos ?? []) if (anulados.has(p.id)) p.activo = false;

      expense.estado = false;
      expense.monto_pagado = 0;
      expense.estado_pago = EstadoPagoGasto.PENDIENTE;
      if (motivo) {
        expense.notas = [expense.notas, `Anulado: ${motivo}`].filter(Boolean).join(' | ');
      }
      return em.save(Expense, expense);
    });
  }

  async remove(id: string) {
    const expense = await this.findOne(id);
    if (Number(expense.monto_pagado) > 0) {
      throw new BadRequestException(
        'El gasto tiene pagos registrados. Anulalo en lugar de borrarlo para no perder el rastro del dinero.',
      );
    }
    return await this.expenseRepository.remove(expense);
  }
}
