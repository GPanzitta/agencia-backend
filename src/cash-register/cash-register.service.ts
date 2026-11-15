import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashRegister, EstadoCaja } from './entities/cash-register.entity';
import { CashMovement, TipoMovimientoCaja } from './entities/cash-movement.entity';
import { User } from '../auth/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { WalletBalance } from '../wallets/entities/wallet-balance.entity';
import { WalletLedgerService } from '../wallets/wallet-ledger.service';
import {
  OrigenMovimiento,
  SignoMovimiento,
} from '../wallets/entities/wallet-movement.entity';
import { fechaLocal, rangoDelDiaLocal } from '../common/fechas.util';
import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { bloquearNumeracion } from '../common/numeracion.util';

@Injectable()
export class CashRegisterService {
  private readonly logger = new Logger(CashRegisterService.name);

  constructor(
    @InjectRepository(CashRegister)
    private cashRegisterRepository: Repository<CashRegister>,
    @InjectRepository(CashMovement)
    private cashMovementRepository: Repository<CashMovement>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(WalletBalance)
    private walletBalanceRepository: Repository<WalletBalance>,
    private readonly ledger: WalletLedgerService,
  ) {}

  /**
   * Número de turno: `T-2026-08-31-001`.
   *
   * La fecha salía de `toISOString()`, que es UTC: con offset −3, un turno
   * abierto después de las 21:00 se etiquetaba con la fecha del día siguiente.
   * Y el conteo usaba `DATE(fecha_apertura)`, que se interpreta en el huso de
   * la base y no necesariamente coincide con el del taller — ahora se cuenta
   * por el rango UTC que cubre el día local, que da igual sea cual sea el tipo
   * de la columna.
   */
  private async generateTurnoNumero(): Promise<string> {
    const dateStr = fechaLocal();
    const { desde, hasta } = rangoDelDiaLocal(dateStr);

    const count = await this.cashRegisterRepository
      .createQueryBuilder('c')
      .andWhere('c.fecha_apertura BETWEEN :desde AND :hasta', { desde, hasta })
      .getCount();

    return `T-${dateStr}-${String(count + 1).padStart(3, '0')}`;
  }

  async getActiveRegister(): Promise<CashRegister | null> {
    return this.cashRegisterRepository.findOne({
      where: { estado: EstadoCaja.ABIERTA },
      relations: ['empleado', 'movimientos', 'movimientos.wallet', 'walletBalances', 'walletBalances.wallet'],
    });
  }

  async openRegister(empleadoId: string, walletAmounts: { wallet_id: string; amount: number }[]) {
    const empleado = await this.userRepository.findOneBy({ id: empleadoId });
    if (!empleado) {
      throw new NotFoundException('Empleado no encontrado.');
    }

    if (!walletAmounts || walletAmounts.length === 0) {
      throw new ErrorDeNegocio(
        'MONTOS_APERTURA_FALTANTES',
        'Debe declarar al menos un monto de apertura por billetera.',
      );
    }
    if (new Set(walletAmounts.map((w) => w.wallet_id)).size !== walletAmounts.length) {
      throw new ErrorDeNegocio('DATOS_INVALIDOS', 'Cada billetera se declara una sola vez.');
    }

    const diferencias: { wallet_id: string; billetera: string; contado: number; segun_sistema: number; diferencia: number }[] = [];
    const savedRegisterId = await this.cashRegisterRepository.manager.transaction(async (em) => {
      // Dos aperturas a la vez dejaban dos turnos abiertos: se ponen en fila
      // acá y la segunda ve el turno de la primera.
      await bloquearNumeracion(em, 'cash_register:abrir');
      const active = await em.findOne(CashRegister, { where: { estado: EstadoCaja.ABIERTA } });
      if (active) {
        throw new ErrorDeNegocio('CAJA_YA_ABIERTA', 'Ya existe una caja abierta.');
      }

      // Validar que todas las billeteras existan y estén activas
      const wallets: Wallet[] = [];
      for (const wa of walletAmounts) {
        const wallet = await em.findOne(Wallet, {
          where: { id: wa.wallet_id, is_deleted: false, is_active: true },
        });
        if (!wallet) {
          throw new NotFoundException(`Billetera con ID ${wa.wallet_id} no encontrada o inactiva.`);
        }
        wallets.push(wallet);
      }

      const turno_numero = await this.generateTurnoNumero();

      // PLA-04: abrir el turno NO toca el libro. Antes, si lo contado no daba
      // con el sistema, se escribía un «Arqueo de apertura» por la diferencia:
      // cualquier mostrador ponía en cero (o donde quisiera) cualquier
      // billetera, sin motivo ni aprobación. Ahora lo contado queda en el
      // turno (`opening_amount`), lo esperado arranca en lo que dice el libro
      // y la diferencia, si la hay, aparece al cerrar: el cierre es sólo de
      // ADMIN y ajusta con motivo.
      const saldos: number[] = [];
      for (let i = 0; i < walletAmounts.length; i++) {
        const segunSistema = Number((await this.ledger.saldo(wallets[i].id)).toFixed(2));
        const contado = Number(Number(walletAmounts[i].amount).toFixed(2));
        saldos.push(segunSistema);
        if (segunSistema !== contado) {
          diferencias.push({
            wallet_id: wallets[i].id,
            billetera: wallets[i].name,
            contado,
            segun_sistema: segunSistema,
            diferencia: Number((contado - segunSistema).toFixed(2)),
          });
        }
      }

      const montoAperturaTotal = Number(walletAmounts.reduce((sum, wa) => sum + Number(wa.amount), 0).toFixed(2));
      const montoEsperado = Number(saldos.reduce((sum, s) => sum + s, 0).toFixed(2));

      const register = em.create(CashRegister, {
        turno_numero,
        empleado,
        monto_apertura: montoAperturaTotal,
        monto_esperado: montoEsperado,
        estado: EstadoCaja.ABIERTA,
      });
      const savedRegister = await em.save(CashRegister, register);

      // Un WalletBalance por billetera: lo contado y lo que el libro espera.
      // Desde acá, cada asiento mueve lo esperado (`reflejarEnArqueo`).
      for (let i = 0; i < walletAmounts.length; i++) {
        const wb = em.create(WalletBalance, {
          wallet: wallets[i],
          walletId: wallets[i].id,
          cashRegister: savedRegister,
          cashRegisterId: savedRegister.id,
          opening_amount: Number(walletAmounts[i].amount),
          expected_amount: saldos[i],
        });
        await em.save(WalletBalance, wb);
      }
      return savedRegister.id;
    });

    if (diferencias.length) {
      this.logger.warn(
        `Turno abierto con diferencias de apertura (las ajusta el admin al cerrar): ` +
          diferencias.map((d) => `${d.billetera}: contado ${d.contado}, sistema ${d.segun_sistema}`).join('; '),
      );
    }

    // Devolver la caja con relaciones, y las diferencias de lo contado para
    // que quien abre sepa que no se corrigieron solas.
    const caja = await this.cashRegisterRepository.findOne({
      where: { id: savedRegisterId },
      relations: ['empleado', 'walletBalances', 'walletBalances.wallet'],
    });
    return caja ? Object.assign(caja, { diferencias_apertura: diferencias }) : caja;
  }

  async closeRegister(
    id: string,
    cerradoPorId: string,
    walletDeclaredAmounts: { wallet_id: string; declared_amount: number }[],
    notas?: string,
  ) {
    if (!walletDeclaredAmounts || walletDeclaredAmounts.length === 0) {
      throw new BadRequestException('Debe declarar montos por billetera para cerrar la caja.');
    }
    const cerrado_por = await this.userRepository.findOneBy({ id: cerradoPorId });

    // PLA-04: el cierre entero va en UNA transacción, con el turno bloqueado.
    // Antes el turno quedaba CERRADO antes de ajustar y fuera de transacción:
    // si un ajuste fallaba, el turno cerraba sin asentar la diferencia, y dos
    // cierres a la vez ajustaban dos veces.
    const registerId = await this.cashRegisterRepository.manager.transaction(async (em) => {
      const bloqueado = await em
        .createQueryBuilder(CashRegister, 'c')
        .where('c.id = :id', { id })
        .setLock('pessimistic_write')
        .getOne();
      if (!bloqueado) throw new NotFoundException('Caja no encontrada.');
      if (bloqueado.estado === EstadoCaja.CERRADA) throw new BadRequestException('La caja ya está cerrada.');
      const register = await em.findOne(CashRegister, { where: { id }, relations: ['walletBalances'] });
      if (!register) throw new NotFoundException('Caja no encontrada.');

      // Actualizar el balance declarado por billetera. Los ajustes al ledger se
      // acumulan y se escriben DESPUÉS de cerrar el turno: si se asentaran acá,
      // el asiento rebotaría en el arqueo del propio turno todavía abierto.
      const ajustesPendientes: { walletId: string; declarado: number }[] = [];
      for (const wda of walletDeclaredAmounts) {
        const balance = register.walletBalances.find(wb => wb.walletId === wda.wallet_id);
        if (balance) {
          const declarado = Number(wda.declared_amount);
          balance.declared_amount = declarado;
          balance.difference = Number((declarado - Number(balance.expected_amount)).toFixed(2));
          await em.save(WalletBalance, balance);
          ajustesPendientes.push({ walletId: wda.wallet_id, declarado });
        }
      }

      // PLA-04: si el arqueo da diferencia, el ajuste lleva motivo. Lo pide
      // ADMIN (el cierre es sólo suyo) y queda escrito en el concepto.
      const conDiferencia = register.walletBalances.some((wb) => Number(wb.difference ?? 0) !== 0);
      const motivo = notas?.trim();
      if (conDiferencia && !motivo) {
        throw new ErrorDeNegocio(
          'MOTIVO_REQUERIDO',
          'El arqueo tiene diferencia con el sistema: escribí el motivo en las notas del cierre para asentar el ajuste.',
        );
      }

      // En Taller los cobros entran por el ledger de billeteras (no hay ventas
      // gastronómicas); los totales "legacy" del turno quedan en cero.
      const ventasEfectivo = 0;
      const ventasDigital = 0;

      const montoDeclaradoTotal = Number(walletDeclaredAmounts.reduce((sum, wda) => sum + Number(wda.declared_amount), 0).toFixed(2));

      // Lo esperado del turno es la suma de lo esperado en CADA billetera, que es
      // lo que el ledger viene moviendo asiento por asiento.
      //
      // Antes se usaba la fórmula legacy —apertura + ventas EN EFECTIVO − retiros
      // + ingresos— con `ventasEfectivo` fijo en cero, así que ignoraba TODO lo
      // que mueve el ledger: los cobros de órdenes, los pagos a proveedores y los
      // gastos. Y se comparaba contra el declarado de todas las billeteras. En la
      // demo eso dio una diferencia de −$41.000 declarando exactamente lo que el
      // sistema decía tener: todos los cierres arrancaban con un faltante
      // inventado, que además se asentaba como ajuste en el ledger unas líneas
      // más abajo.
      const esperado = Number(
        register.walletBalances
          .reduce((sum, wb) => sum + Number(wb.expected_amount), 0)
          .toFixed(2),
      );

      register.ventas_efectivo = ventasEfectivo;
      register.ventas_digital = ventasDigital;
      register.monto_esperado = esperado;
      register.monto_declarado = montoDeclaradoTotal;
      register.diferencia = Number((montoDeclaradoTotal - esperado).toFixed(2));
      register.estado = EstadoCaja.CERRADA;
      register.fecha_cierre = new Date();
      register.notas_cierre = notas;
      register.cerrado_por = cerrado_por || undefined;

      await em.save(CashRegister, register);

      // La diferencia del arqueo se ASIENTA, no se pisa. Antes esto hacía
      // `current_balance = declarado` directo sobre la billetera: sin asiento,
      // el libro y el saldo se desincronizaban en cada cierre con diferencia —
      // exactamente el descuadre que recalcular() denuncia. Con el ajuste por
      // el ledger, el faltante o sobrante del turno queda como un movimiento
      // visible, con el turno y el motivo en el concepto. Con el mismo `em`: el
      // turno ya figura cerrado para el ledger y el ajuste no rebota en su arqueo.
      for (const a of ajustesPendientes) {
        const saldoLedger = await this.ledger.saldoEn(em, a.walletId);
        if (Number(saldoLedger.toFixed(2)) !== Number(a.declarado.toFixed(2))) {
          await this.ledger.ajustar(
            a.walletId,
            a.declarado,
            `Arqueo de cierre ${register.turno_numero}${motivo ? ` · ${motivo}` : ''}`,
            cerradoPorId,
            em,
          );
        }
      }
      return register.id;
    });

    return this.cashRegisterRepository.findOne({
      where: { id: registerId },
      relations: ['empleado', 'cerrado_por', 'walletBalances', 'walletBalances.wallet'],
    });
  }

  /**
   * Ingreso o retiro de caja: asiento en el ledger, movimiento de caja y
   * totales del turno, en UNA transacción (informe 14/10, 7.3). Antes eran
   * tres escrituras sueltas: si fallaba la segunda, la plata ya había salido
   * de la billetera sin movimiento de caja que la explique.
   *
   * El turno se bloquea (`FOR UPDATE`): dos movimientos a la vez sumaban sobre
   * el mismo `ingresos_extra` leído y uno se perdía, y un cierre en paralelo no
   * puede colarse entre el chequeo de «abierta» y el asiento.
   */
  async addMovement(registerId: string, empleadoId: string, tipo: TipoMovimientoCaja, monto: number, motivo: string, walletId?: string) {
    return this.cashRegisterRepository.manager.transaction(async (em) => {
      const register = await em
        .createQueryBuilder(CashRegister, 'c')
        .where('c.id = :id', { id: registerId })
        .setLock('pessimistic_write')
        .getOne();
      if (!register) throw new NotFoundException('Caja no encontrada.');
      if (register.estado === EstadoCaja.CERRADA) throw new BadRequestException('La caja está cerrada.');

      const empleado = await em.findOne(User, { where: { id: empleadoId } });
      if (!empleado) throw new NotFoundException('Empleado no encontrado.');

      let wallet: Wallet | undefined = undefined;
      if (walletId) {
        const found = await em.findOne(Wallet, {
          where: { id: walletId, is_deleted: false, is_active: true },
        });
        if (!found) throw new NotFoundException(`Billetera con ID ${walletId} no encontrada.`);
        wallet = found;
      }

      // El asiento en el ledger va PRIMERO: es quien valida los fondos. Antes
      // este método restaba `wallet.current_balance` a mano — sin asiento, sin
      // chequeo de fondos y desincronizando el saldo de la suma de movimientos
      // (el descuadre que `recalcular()` denuncia). Un retiro que dejaría la
      // billetera en negativo ahora rebota acá antes de tocar nada.
      //
      // El ledger también refleja el delta en el arqueo del turno abierto
      // (expected_amount), así que la actualización manual de WalletBalance que
      // vivía acá se elimina: mantenerla duplicaría el ajuste.
      if (wallet) {
        await this.ledger.registrar(
          {
            walletId: wallet.id,
            signo:
              tipo === TipoMovimientoCaja.INGRESO
                ? SignoMovimiento.INGRESO
                : SignoMovimiento.EGRESO,
            monto: Number(monto),
            origen:
              tipo === TipoMovimientoCaja.INGRESO
                ? OrigenMovimiento.INGRESO_CAJA
                : OrigenMovimiento.RETIRO_CAJA,
            concepto: motivo?.slice(0, 250) || 'Movimiento de caja',
            empleadoId: empleado.id,
            companyId: register.companyId ?? wallet.companyId,
          },
          em,
        );
      }

      const movement = em.create(CashMovement, {
        cashRegister: register,
        empleado,
        tipo,
        monto,
        motivo,
        ...(wallet ? { wallet, walletId: wallet.id } : {}),
      });

      await em.save(CashMovement, movement);

      // Actualizar campos legacy de la caja
      if (tipo === TipoMovimientoCaja.INGRESO) {
        register.ingresos_extra = Number(register.ingresos_extra) + monto;
      } else {
        register.retiros_caja = Number(register.retiros_caja) + monto;
      }

      // Actualizamos el monto esperado sumando ingresos y restando retiros
      register.monto_esperado = Number(register.monto_apertura) + Number(register.ventas_efectivo) - Number(register.retiros_caja) + Number(register.ingresos_extra);

      await em.save(CashRegister, register);

      return movement;
    });
  }

  /** Solo los contadores informativos del turno; el saldo real vive en el ledger. */
  async sumarVentaLegacy(monto: number, walletType: string) {
    const active = await this.getActiveRegister();
    if (!active) return;
    if (walletType === 'cash') active.ventas_efectivo = Number(active.ventas_efectivo) + monto;
    else active.ventas_digital = Number(active.ventas_digital) + monto;
    active.monto_esperado = Number(active.monto_apertura) + Number(active.ventas_efectivo) - Number(active.retiros_caja) + Number(active.ingresos_extra);
    await this.cashRegisterRepository.save(active);
  }

  async getHistory(limit: number = 10) {
    return this.cashRegisterRepository.find({
      where: { estado: EstadoCaja.CERRADA },
      order: { fecha_cierre: 'DESC' },
      take: limit,
      relations: ['empleado', 'cerrado_por', 'walletBalances', 'walletBalances.wallet'],
    });
  }

  // Se llama desde SalesService cuando se hace un cobro para actualizar los totales cacheados en la caja activa
  /**
   * Registra el cobro de una venta en la billetera, por el ledger.
   *
   * Antes sumaba `wallet.current_balance` a mano — el mismo bypass que se
   * sacó de addMovement y del cierre: sin asiento, el libro y el saldo se
   * desincronizaban con cada venta. El ledger escribe el asiento (origen
   * VENTA) y refleja el delta en el arqueo del turno abierto; acá solo
   * quedan los totales legacy del turno.
   */
  async addSaleToActiveRegister(monto: number, wallet: Wallet, saleRef?: { id?: string; numero?: string }) {
    await this.ledger.registrar({
      walletId: wallet.id,
      signo: SignoMovimiento.INGRESO,
      monto: Number(monto),
      origen: OrigenMovimiento.VENTA,
      origen_id: saleRef?.id,
      concepto: saleRef?.numero ? `Cobro ${saleRef.numero}` : 'Cobro de venta',
      companyId: wallet.companyId,
    });

    const active = await this.getActiveRegister();
    if (!active) return;

    // Totales legacy del turno (informativos)
    if (wallet.type === 'cash') {
      active.ventas_efectivo = Number(active.ventas_efectivo) + monto;
    } else {
      active.ventas_digital = Number(active.ventas_digital) + monto;
    }
    active.monto_esperado = Number(active.monto_apertura) + Number(active.ventas_efectivo) - Number(active.retiros_caja) + Number(active.ingresos_extra);
    await this.cashRegisterRepository.save(active);
  }

  // Revertir el balance de una billetera cuando se cancela una venta
  /**
   * Devuelve el cobro de una venta cancelada, por el ledger (asiento
   * contrario, con permitirNegativo: una corrección se escribe siempre).
   */
  async revertSaleFromWallet(monto: number, wallet: Wallet, saleRef?: { id?: string; numero?: string }) {
    await this.ledger.registrar({
      walletId: wallet.id,
      signo: SignoMovimiento.EGRESO,
      monto: Number(monto),
      origen: OrigenMovimiento.VENTA,
      origen_id: saleRef?.id,
      concepto: saleRef?.numero ? `Anulación cobro ${saleRef.numero}` : 'Anulación de cobro de venta',
      companyId: wallet.companyId,
      permitirNegativo: true,
    });

    const active = await this.getActiveRegister();
    if (active) {
      if (wallet.type === 'cash') {
        active.ventas_efectivo = Number(active.ventas_efectivo) - monto;
      } else {
        active.ventas_digital = Number(active.ventas_digital) - monto;
      }
      active.monto_esperado = Number(active.monto_apertura) + Number(active.ventas_efectivo) - Number(active.retiros_caja) + Number(active.ingresos_extra);
      await this.cashRegisterRepository.save(active);
    }
  }
}
