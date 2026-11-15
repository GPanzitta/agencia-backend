import {
  Check,
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { Wallet } from './wallet.entity';
import { User } from '../../auth/entities/user.entity';
import { Company } from '../../companies/entities/company.entity';

export enum SignoMovimiento {
  INGRESO = 'ingreso',
  EGRESO = 'egreso',
}

/** De dónde salió el movimiento. Permite auditar sin joins adivinados. */
export enum OrigenMovimiento {
  APERTURA = 'apertura',       // Asiento inicial al empezar a usar el ledger
  VENTA = 'venta',
  PAGO_GASTO = 'pago_gasto',
  ANULACION_PAGO = 'anulacion_pago',
  RETIRO_CAJA = 'retiro_caja',
  INGRESO_CAJA = 'ingreso_caja',
  AJUSTE = 'ajuste',           // Corrección manual, siempre con motivo
  TRANSFERENCIA = 'transferencia',
  ANTICIPO_PROVEEDOR = 'anticipo_proveedor',
  DEVOLUCION_VENTA = 'devolucion_venta', // Reintegro de una devolución de venta (spec 2026-10-02 §3.4)
}

/**
 * Asiento inmutable del ledger de billeteras.
 *
 * Es la única verdad sobre el dinero: `wallet.current_balance` pasa a ser un
 * caché de la suma de estos asientos. Si alguna vez se desincronizan, el saldo
 * se puede recalcular — antes, un saldo equivocado era indistinguible de uno
 * correcto porque no había con qué contrastarlo.
 *
 * No se actualiza ni se borra. Revertir un movimiento significa escribir el
 * asiento contrario, igual que en contabilidad.
 */
// Espejo de la migración 1790000000000-IntegridadDatos (montos y cantidades no negativos).
@Check('CHK_wallet_movements_no_negativos', '"monto" >= 0')
@Entity('wallet_movements')
@Index(['walletId', 'fecha'])
export class WalletMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Wallet, { eager: true })
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Index()
  @Column({ name: 'wallet_id' })
  walletId: string;

  @Column({ type: 'enum', enum: SignoMovimiento })
  signo: SignoMovimiento;

  /** Siempre positivo. El sentido lo da `signo`. */
  @Column({ type: 'decimal', precision: 14, scale: 2 })
  monto: number;

  /** Saldo de la billetera después de aplicar este asiento. */
  @Column({ type: 'decimal', precision: 14, scale: 2 })
  saldo_posterior: number;

  @Column({ type: 'enum', enum: OrigenMovimiento })
  origen: OrigenMovimiento;

  /** Id de la venta, el pago de gasto, el movimiento de caja, etc. */
  @Column({ type: 'uuid', nullable: true })
  origen_id?: string;

  @Column({ type: 'varchar', length: 250 })
  concepto: string;

  @CreateDateColumn({ type: 'timestamptz' })
  fecha: Date;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'empleado_id' })
  empleado?: User;

  /** Turno de caja en el que ocurrió, si había uno abierto. */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  cash_register_id?: string;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'company_id', nullable: true })
  companyId: string;
}
