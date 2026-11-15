import { Check, Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Wallet } from './wallet.entity';
import { CashRegister } from '../../cash-register/entities/cash-register.entity';
import { Company } from '../../companies/entities/company.entity';

// Espejo de la migración 1790000000000-IntegridadDatos (montos y cantidades no negativos).
@Check('CHK_wallet_balances_no_negativos', '"opening_amount" >= 0 AND "declared_amount" >= 0')
@Entity('wallet_balances')
export class WalletBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Wallet, { eager: true })
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({ name: 'wallet_id' })
  walletId: string;

  @ManyToOne(() => CashRegister, (cr) => cr.walletBalances)
  @JoinColumn({ name: 'cash_register_id' })
  cashRegister: CashRegister;

  @Column({ name: 'cash_register_id' })
  cashRegisterId: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  opening_amount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  expected_amount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  declared_amount?: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  difference?: number;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'company_id', nullable: true })
  companyId: string;
}
