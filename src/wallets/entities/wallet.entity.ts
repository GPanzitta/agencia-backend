import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

export enum WalletType {
  CASH = 'cash',
  BANK = 'bank',
  DIGITAL = 'digital',
}

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'enum', enum: WalletType, default: WalletType.CASH })
  type: WalletType;

  /** Agencia (12/11/2026): en qué moneda está la plata de esta caja. Una caja no mezcla pesos y dólares. */
  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  moneda: 'ARS' | 'USD';

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  current_balance: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'boolean', default: false })
  is_deleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'company_id', nullable: true })
  companyId: string;
}
