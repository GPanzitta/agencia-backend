import { Check, Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, OneToMany, Index, Unique } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { CashMovement } from './cash-movement.entity';
import { Company } from '../../companies/entities/company.entity';
import { WalletBalance } from '../../wallets/entities/wallet-balance.entity';

export enum EstadoCaja {
    ABIERTA = 'abierta',
    CERRADA = 'cerrada',
}

// Espejo de la migración 1790000000000-IntegridadDatos (montos y cantidades no negativos).
@Check('CHK_cash_registers_no_negativos', '"monto_apertura" >= 0 AND "ventas_efectivo" >= 0 AND "ventas_digital" >= 0 AND "retiros_caja" >= 0 AND "ingresos_extra" >= 0 AND "monto_declarado" >= 0')
@Entity('cash_registers')
@Unique(['turno_numero', 'companyId'])
export class CashRegister {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 50 })
    turno_numero: string;

    @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    fecha_apertura: Date;

    @Column({ type: 'timestamptz', nullable: true })
    fecha_cierre?: Date;

    // Legacy: monto_apertura único (se mantiene para retrocompatibilidad)
    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    monto_apertura: number;

    // Calculados (legacy):
    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    ventas_efectivo: number;

    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    ventas_digital: number;

    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    retiros_caja: number;

    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    ingresos_extra: number;

    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    monto_esperado: number; // apertura + ventas_eff - retiros + ingresos

    // Declarado por el usuario (legacy):
    @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
    monto_declarado?: number;

    @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
    diferencia?: number; // declarado - esperado

    @Column({ type: 'enum', enum: EstadoCaja, default: EstadoCaja.ABIERTA })
    estado: EstadoCaja;

    @Column({ type: 'text', nullable: true })
    notas_cierre?: string;

    // Relaciones
    @ManyToOne(() => User, { eager: true })
    @JoinColumn({ name: 'empleado_id' })
    empleado: User;

    @ManyToOne(() => User, { nullable: true, eager: true })
    @JoinColumn({ name: 'cerrado_por_id' })
    cerrado_por?: User;

    @OneToMany(() => CashMovement, (mov) => mov.cashRegister)
    movimientos: CashMovement[];

    // --- Multi-billetera ---
    @OneToMany(() => WalletBalance, (wb) => wb.cashRegister)
    walletBalances: WalletBalance[];

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'company_id', nullable: true })
  companyId: string;
}
