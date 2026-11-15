import { Check, Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { CashRegister } from './cash-register.entity';
import { Company } from '../../companies/entities/company.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';

export enum TipoMovimientoCaja {
    RETIRO = 'retiro',
    INGRESO = 'ingreso',
}

// Espejo de la migración 1790000000000-IntegridadDatos (montos y cantidades no negativos).
@Check('CHK_cash_movements_no_negativos', '"monto" >= 0')
@Entity('cash_movements')
export class CashMovement {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'enum', enum: TipoMovimientoCaja })
    tipo: TipoMovimientoCaja;

    @Column({ type: 'decimal', precision: 14, scale: 2 })
    monto: number;

    @Column({ type: 'varchar', length: 200 })
    motivo: string;

    @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    fecha: Date;

    @ManyToOne(() => CashRegister, (register) => register.movimientos)
    @JoinColumn({ name: 'cash_register_id' })
    cashRegister: CashRegister;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'empleado_id' })
  empleado: User;

  // --- Billetera asociada al movimiento ---
  @ManyToOne(() => Wallet, { nullable: true, eager: true })
  @JoinColumn({ name: 'wallet_id' })
  wallet?: Wallet;

  @Column({ name: 'wallet_id', nullable: true })
  walletId?: string;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'company_id', nullable: true })
  companyId: string;
}
