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
import { Expense } from './expense.entity';
import { MetodoPagoGasto } from './expense.enums';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { User } from '../../auth/entities/user.entity';
import { Company } from '../../companies/entities/company.entity';

/**
 * Un pago imputado a un gasto.
 *
 * Es una tabla aparte y no un par de campos en Expense porque a proveedor se le
 * paga en cuotas: media factura hoy, el resto a fin de mes. Con un solo campo
 * "pagado si/no" esa realidad no se puede representar.
 *
 * Cada pago tiene su asiento en el ledger de billeteras; `wallet_movement_id`
 * guarda cuál, para poder revertirlo si el pago se anula.
 */
// Espejo de la migración 1790000000000-IntegridadDatos (montos y cantidades no negativos).
@Check('CHK_expense_payments_no_negativos', '"monto" >= 0')
@Entity('expense_payments')
export class ExpensePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Expense, (expense) => expense.pagos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'expense_id' })
  expense: Expense;

  @Index()
  @Column({ name: 'expense_id' })
  expenseId: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  monto: number;

  @Column({ type: 'date' })
  fecha_pago: Date;

  @ManyToOne(() => Wallet, { eager: true })
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({ name: 'wallet_id' })
  walletId: string;

  @Column({ type: 'enum', enum: MetodoPagoGasto })
  metodo_pago: MetodoPagoGasto;

  /**
   * Anticipo del que salió este pago, si no salió de una caja. Al anular,
   * el monto vuelve al saldo del anticipo — no a la caja, porque de la caja
   * nunca salió en ese momento.
   */
  @Column({ type: 'uuid', nullable: true })
  supplier_advance_id?: string;

  /** Asiento del ledger que generó este pago. Permite revertirlo al anular. */
  @Column({ type: 'uuid', nullable: true })
  wallet_movement_id?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  referencia?: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'empleado_id' })
  empleado?: User;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'company_id', nullable: true })
  companyId: string;
}
