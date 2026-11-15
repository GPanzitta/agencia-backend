import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { Wallet } from './entities/wallet.entity';
import { WalletBalance } from './entities/wallet-balance.entity';
import {
  OrigenMovimiento,
  SignoMovimiento,
  WalletMovement,
} from './entities/wallet-movement.entity';
import { CashRegister, EstadoCaja } from '../cash-register/entities/cash-register.entity';
import { ConflictoDeNegocio, ErrorDeNegocio } from '../common/errores/error-negocio';
import { decidirReversa } from './anulacion.util';

export interface RegistrarMovimiento {
  walletId: string;
  signo: SignoMovimiento;
  /** Siempre positivo. El sentido lo da el signo. */
  monto: number;
  origen: OrigenMovimiento;
  concepto: string;
  origen_id?: string;
  empleadoId?: string;
  companyId?: string;
  /**
   * Deja pasar un egreso que hunde el saldo bajo cero. Solo para
   * correcciones (`revertir`): anular el ingreso de una venta tiene que
   * poder escribirse aunque la plata ya se haya gastado — bloquear la
   * corrección dejaría el ledger mintiendo, que es peor que el negativo.
   * Ningún flujo operativo (pagos, retiros) debe activarlo.
   */
  permitirNegativo?: boolean;
}

/**
 * El único lugar del sistema que mueve plata.
 *
 * Cada entrada o salida de cualquier billetera pasa por acá y queda como un
 * asiento inmutable. `wallet.current_balance` se mantiene como caché, pero deja
 * de ser la verdad: la verdad es la suma del ledger, y `recalcular()` lo
 * demuestra.
 *
 * Antes de esto los saldos solo subían — las ventas depositaban y los gastos no
 * descontaban nada.
 */
@Injectable()
export class WalletLedgerService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(WalletMovement)
    private readonly movementRepo: Repository<WalletMovement>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Escribe un asiento y actualiza el saldo.
   *
   * Acepta un EntityManager para poder participar de una transacción abierta
   * por otro servicio: pagar un gasto tiene que ser atómico junto con su asiento.
   */
  async registrar(
    datos: RegistrarMovimiento,
    manager?: EntityManager,
  ): Promise<WalletMovement> {
    const run = async (em: EntityManager) => {
      const monto = Number(datos.monto);
      if (!Number.isFinite(monto) || monto <= 0) {
        throw new BadRequestException('El monto del movimiento debe ser mayor a cero');
      }

      // Bloqueo pesimista: dos pagos simultáneos sobre la misma billetera no
      // pueden leer el mismo saldo y pisarse.
      const wallet = await em.findOne(Wallet, {
        where: { id: datos.walletId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) throw new NotFoundException('Billetera inexistente');
      if (!wallet.is_active || wallet.is_deleted) {
        throw new BadRequestException('La billetera "' + wallet.name + '" está inactiva');
      }

      await this.asegurarApertura(em, wallet);

      const saldoPrevio = await this.saldoSegunLedger(em, wallet.id);
      const delta = datos.signo === SignoMovimiento.INGRESO ? monto : -monto;
      const saldoPosterior = Number((saldoPrevio + delta).toFixed(2));

      // Chequeo de fondos. Antes esto no existía: se podía pagar un gasto de
      // $50.000 desde una caja con $10.000 y el saldo quedaba en -$40.000 sin
      // que nada lo señalara. El bloqueo pesimista de arriba garantiza que dos
      // egresos simultáneos no puedan pasar los dos leyendo el mismo saldo.
      if (
        datos.signo === SignoMovimiento.EGRESO &&
        saldoPosterior < 0 &&
        !datos.permitirNegativo
      ) {
        throw new ErrorDeNegocio(
          'FONDOS_INSUFICIENTES',
          `Fondos insuficientes en "${wallet.name}": hay $${saldoPrevio.toFixed(2)} ` +
            `y el egreso es de $${monto.toFixed(2)}`,
          { disponible: saldoPrevio, solicitado: monto, billetera: wallet.name },
        );
      }

      const turnoId = await this.turnoAbierto(em, datos.companyId ?? wallet.companyId);

      const movimiento = em.create(WalletMovement, {
        walletId: wallet.id,
        signo: datos.signo,
        monto,
        saldo_posterior: saldoPosterior,
        origen: datos.origen,
        origen_id: datos.origen_id,
        concepto: datos.concepto,
        empleado: datos.empleadoId ? ({ id: datos.empleadoId } as never) : undefined,
        cash_register_id: turnoId ?? undefined,
        companyId: datos.companyId ?? wallet.companyId,
      });
      const guardado = await em.save(WalletMovement, movimiento);

      wallet.current_balance = saldoPosterior;
      await em.save(Wallet, wallet);

      // Si hay turno abierto, el arqueo de ESA billetera se mueve también.
      // Vale para efectivo, banco y digital por igual.
      if (turnoId) {
        await this.reflejarEnArqueo(em, turnoId, wallet.id, delta, datos.companyId ?? wallet.companyId);
      }

      return guardado;
    };

    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  /**
   * Mueve plata de una caja a otra: dos asientos en una sola transacción.
   *
   * El egreso pasa por el chequeo de fondos normal — no se puede transferir
   * lo que no hay. Los asientos quedan enlazados (`origen_id` del ingreso
   * apunta al egreso) para poder seguir el viaje de la plata.
   *
   * Como `registrar`, acepta el EntityManager de una transacción abierta por
   * otro servicio: el cierre de una ruta transfiere, asienta el faltante y
   * guarda la ruta todo junto (D2).
   */
  async transferir(
    origenId: string,
    destinoId: string,
    monto: number,
    motivo: string,
    empleadoId?: string,
    manager?: EntityManager,
  ): Promise<{ egreso: WalletMovement; ingreso: WalletMovement }> {
    if (origenId === destinoId) {
      throw new BadRequestException('Origen y destino son la misma caja');
    }

    const run = async (em: EntityManager) => {
      const [origen, destino] = await Promise.all([
        em.findOne(Wallet, { where: { id: origenId } }),
        em.findOne(Wallet, { where: { id: destinoId } }),
      ]);
      if (!origen || !destino) throw new NotFoundException('Caja inexistente');

      const egreso = await this.registrar(
        {
          walletId: origen.id,
          signo: SignoMovimiento.EGRESO,
          monto,
          origen: OrigenMovimiento.TRANSFERENCIA,
          concepto: `Transferencia a ${destino.name} · ${motivo}`.slice(0, 250),
          empleadoId,
          companyId: origen.companyId,
        },
        em,
      );

      const ingreso = await this.registrar(
        {
          walletId: destino.id,
          signo: SignoMovimiento.INGRESO,
          monto,
          origen: OrigenMovimiento.TRANSFERENCIA,
          origen_id: egreso.id,
          concepto: `Transferencia desde ${origen.name} · ${motivo}`.slice(0, 250),
          empleadoId,
          companyId: destino.companyId,
        },
        em,
      );

      return { egreso, ingreso };
    };

    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  /**
   * Ajusta el saldo de una caja a lo que hay físicamente.
   *
   * Es lo que se usa cuando se contó la caja y el sistema dice otra cosa: se
   * declara el saldo real y se escribe UN asiento de ajuste por la
   * diferencia, con motivo obligatorio. No se toca el historial — en un
   * ledger, corregir es agregar. Permite bajar a cualquier valor (la
   * realidad manda), por eso el ajuste negativo no pasa por el chequeo de
   * fondos.
   */
  async ajustar(
    walletId: string,
    saldoReal: number,
    motivo: string,
    empleadoId?: string,
    /** Para ajustar dentro de una transacción ajena (el cierre de turno, PLA-04). */
    manager?: EntityManager,
  ): Promise<{ anterior: number; ajuste: number; actual: number }> {
    const enTransaccion = <T>(fn: (em: EntityManager) => Promise<T>) =>
      manager ? fn(manager) : this.dataSource.transaction(fn);
    return enTransaccion(async (em) => {
      const wallet = await em.findOne(Wallet, {
        where: { id: walletId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) throw new NotFoundException('Caja inexistente');

      const actual = await this.saldoSegunLedger(em, walletId);
      const delta = Number((saldoReal - actual).toFixed(2));
      if (delta === 0) {
        throw new BadRequestException('El saldo declarado es el que ya tiene la caja');
      }

      await this.registrar(
        {
          walletId,
          signo: delta > 0 ? SignoMovimiento.INGRESO : SignoMovimiento.EGRESO,
          monto: Math.abs(delta),
          origen: OrigenMovimiento.AJUSTE,
          concepto: `Ajuste de saldo · ${motivo}`.slice(0, 250),
          empleadoId,
          companyId: wallet.companyId,
          permitirNegativo: true,
        },
        em,
      );

      return { anterior: actual, ajuste: delta, actual: saldoReal };
    });
  }

  /**
   * Revierte un movimiento escribiendo el asiento contrario.
   * No se edita ni se borra el original: en un ledger, corregir es agregar.
   *
   * `destino` es la decisión de a dónde va la plata cuando el movimiento
   * original pertenece a un turno de caja ya cerrado:
   *
   * - Mismo turno abierto → se revierte sin preguntar; `destino` se ignora.
   * - Turno distinto + `'turno_actual'` → devolución real: el asiento entra
   *   al arqueo del turno abierto, porque la plata entró físicamente hoy.
   * - Turno distinto + `'sin_arqueo'` → error de carga: NO se escribe ningún
   *   asiento. El turno viejo cerró con sobrante (la plata nunca salió del
   *   cajón) y el arqueo de cierre de ese turno ya realineó el ledger con lo
   *   contado (desde PLA-04 la apertura no ajusta: lo hace el cierre, con
   *   motivo) — escribir un ingreso acá contaría esa plata dos veces y el
   *   turno de hoy cerraría con faltante.
   * - Turno distinto sin `destino` → error DESTINO_REQUERIDO: la decisión es
   *   del operador, no del código. Antes se imputaba silenciosamente al turno
   *   abierto, y la UI encima prometía "vuelve a la caja de la que salió".
   * - Movimiento original sin turno (nunca perteneció a un arqueo) → se
   *   escribe siempre, haya o no caja abierta hoy: no hay arqueo que proteger,
   *   así que la exigencia de caja abierta no defiende nada. El taller no
   *   tiene pantalla de caja, así que ningún movimiento tiene turno.
   *
   * Exigir caja abierta no es capricho: garantiza que hubo una apertura (y su
   * arqueo) después del turno original, que es lo que hace válido el caso
   * `sin_arqueo`. Sin esa garantía habría que modelar "cerrado pero aún no
   * reabierto", donde el tratamiento correcto es el inverso. La decisión vive
   * en `decidirReversa` (`anulacion.util.ts`), no acá.
   */
  async revertir(
    movimientoId: string,
    concepto: string,
    manager?: EntityManager,
    destino?: 'turno_actual' | 'sin_arqueo',
  ): Promise<WalletMovement | null> {
    // Sin manager se abre una transacción propia: el lock de abajo sólo
    // sirve dentro de una.
    if (!manager) {
      return this.dataSource.transaction((em) => this.revertir(movimientoId, concepto, em, destino));
    }
    const em = manager;
    // PLA-03: el original se lee CON lock (QueryBuilder: la entidad tiene
    // relaciones eager y `findOne` + lock arma un LEFT JOIN que Postgres
    // rechaza con FOR UPDATE). Dos anulaciones a la vez del mismo asiento
    // —anular el pago y el gasto juntos, o un doble clic— se ponen en fila
    // acá, y la segunda ve la reversa que escribió la primera.
    const original = await em
      .createQueryBuilder(WalletMovement, 'm')
      .where('m.id = :id', { id: movimientoId })
      .setLock('pessimistic_write')
      .getOne();
    if (!original) throw new NotFoundException('Movimiento inexistente');

    // Un asiento se revierte una sola vez. Antes no se miraba: el mismo
    // egreso volvía dos veces a la caja y el saldo quedaba inflado.
    const yaRevertido = await em
      .createQueryBuilder(WalletMovement, 'r')
      .where('r.origen = :origen', { origen: OrigenMovimiento.ANULACION_PAGO })
      .andWhere('r.origen_id = :id', { id: original.id })
      .getCount();
    if (yaRevertido > 0) {
      throw new ConflictoDeNegocio('MOVIMIENTO_YA_REVERTIDO', 'Ese movimiento ya se anuló: la plata ya volvió a la billetera.');
    }

    const turnoId = await this.turnoAbierto(em, original.companyId);
    const decision = decidirReversa({
      turnoOriginalId: original.cash_register_id ?? null,
      turnoAbiertoId: turnoId,
      destino,
    });

    if (decision.accion === 'error') {
      if (decision.codigo === 'CAJA_CERRADA') {
        throw new ErrorDeNegocio(
          'CAJA_CERRADA',
          'El pago pertenece a un turno de caja: abrí un turno antes de anularlo, así la reversa queda registrada en un arqueo.',
        );
      }
      throw new BadRequestException({
        message:
          'El pago pertenece a un turno ya cerrado. Indicá el destino de la reversa: ' +
          "'turno_actual' si el proveedor devolvió la plata, o 'sin_arqueo' si fue un error de carga.",
        code: 'DESTINO_REQUERIDO',
      });
    }

    // Error de carga sobre un turno cerrado: la corrección contable ya la hizo
    // el arqueo de cierre de ese turno. Se deja constancia sin mover plata.
    if (decision.accion === 'omitir') return null;

    return this.registrar(
      {
        walletId: original.walletId,
        signo:
          original.signo === SignoMovimiento.INGRESO
            ? SignoMovimiento.EGRESO
            : SignoMovimiento.INGRESO,
        monto: Number(original.monto),
        origen: OrigenMovimiento.ANULACION_PAGO,
        origen_id: original.id,
        concepto,
        companyId: original.companyId,
        // Una corrección se escribe siempre: si el asiento original fue un
        // ingreso y la plata ya se gastó, bloquear la reversión dejaría el
        // ledger mintiendo.
        permitirNegativo: true,
      },
      manager,
    );
  }

  /** Saldo real según el ledger, sin mirar el caché. */
  async saldo(walletId: string): Promise<number> {
    return this.saldoSegunLedger(this.dataSource.manager, walletId);
  }

  /** Como `saldo`, pero leído dentro de la transacción del llamador. */
  async saldoEn(em: EntityManager, walletId: string): Promise<number> {
    return this.saldoSegunLedger(em, walletId);
  }

  /**
   * Repara el caché: recalcula current_balance desde el ledger y devuelve la
   * diferencia que había. Si no da cero, hubo una escritura que no pasó por acá.
   */
  async recalcular(
    walletId: string,
  ): Promise<{ anterior: number; actual: number; diferencia: number }> {
    const wallet = await this.walletRepo.findOne({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Billetera inexistente');

    const anterior = Number(wallet.current_balance);
    const actual = await this.saldoSegunLedger(this.dataSource.manager, walletId);
    wallet.current_balance = actual;
    await this.walletRepo.save(wallet);

    return { anterior, actual, diferencia: Number((actual - anterior).toFixed(2)) };
  }

  async movimientos(walletId: string, limite = 100): Promise<WalletMovement[]> {
    return this.movementRepo.find({
      where: { walletId },
      order: { fecha: 'DESC' },
      take: limite,
    });
  }

  // ─── Internos ───────────────────────────────────────────────────────────

  /**
   * El ledger vale desde que se instala. En vez de reconstruir el histórico de
   * ventas, la primera vez que se toca una billetera se escribe un asiento de
   * apertura con el saldo que ya tenía. De ahí en más, todo cierra.
   */
  private async asegurarApertura(em: EntityManager, wallet: Wallet): Promise<void> {
    const existe = await em.count(WalletMovement, { where: { walletId: wallet.id } });
    if (existe > 0) return;

    const saldoInicial = Number(wallet.current_balance) || 0;
    await em.save(
      WalletMovement,
      em.create(WalletMovement, {
        walletId: wallet.id,
        signo: saldoInicial < 0 ? SignoMovimiento.EGRESO : SignoMovimiento.INGRESO,
        monto: Math.abs(saldoInicial),
        saldo_posterior: saldoInicial,
        origen: OrigenMovimiento.APERTURA,
        concepto: 'Saldo al comenzar a registrar movimientos',
        companyId: wallet.companyId,
      }),
    );
  }

  private async saldoSegunLedger(em: EntityManager, walletId: string): Promise<number> {
    const fila = await em
      .createQueryBuilder(WalletMovement, 'm')
      .select(
        'COALESCE(SUM(CASE WHEN m.signo = :ingreso THEN m.monto ELSE -m.monto END), 0)',
        'total',
      )
      .where('m.wallet_id = :walletId', { walletId })
      .setParameter('ingreso', SignoMovimiento.INGRESO)
      .getRawOne<{ total: string }>();

    return Number(Number(fila?.total ?? 0).toFixed(2));
  }

  /**
   * El turno abierto de ESTA empresa. Se filtra por companyId a propósito:
   * cash-register.service.getActiveRegister() no lo hace, y con más de una
   * empresa devolvería el turno de otra.
   */
  private async turnoAbierto(em: EntityManager, companyId?: string): Promise<string | null> {
    const where: Record<string, unknown> = { estado: EstadoCaja.ABIERTA };
    if (companyId) where.companyId = companyId;
    const activa = await em.findOne(CashRegister, {
      where,
      order: { fecha_apertura: 'DESC' },
    });
    return activa?.id ?? null;
  }

  private async reflejarEnArqueo(
    em: EntityManager,
    cashRegisterId: string,
    walletId: string,
    delta: number,
    companyId?: string,
  ): Promise<void> {
    let balance = await em.findOne(WalletBalance, {
      where: { cashRegisterId, walletId },
    });
    // Si la billetera no se declaró al abrir el turno, se crea su renglón con
    // apertura en cero. Antes se salteaba y la plata movida por acá quedaba
    // fuera de todo arqueo: el saldo de la billetera cambiaba pero ningún
    // turno respondía por ese movimiento.
    if (!balance) {
      balance = em.create(WalletBalance, {
        cashRegisterId,
        walletId,
        opening_amount: 0,
        expected_amount: 0,
        companyId,
      });
    }

    balance.expected_amount = Number((Number(balance.expected_amount) + delta).toFixed(2));
    await em.save(WalletBalance, balance);
  }
}
