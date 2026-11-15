import {
  Check,
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { Proveedor } from '../../proveedores/entities/proveedore.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { User } from '../../auth/entities/user.entity';
import { Company } from '../../companies/entities/company.entity';

/**
 * Un anticipo a proveedor: plata entregada a cuenta, antes de la factura.
 *
 * "Le dejo $50.000 a cuenta" es distinto de pagar comprobantes — por eso el
 * pago FIFO rechaza pagar más que la deuda. El anticipo sale de una caja en
 * el momento (con su asiento y su chequeo de fondos) y queda como saldo a
 * favor que las próximas facturas consumen primero.
 */
// Espejo de la migración 1790000000000-IntegridadDatos (montos y cantidades no negativos).
@Check('CHK_supplier_advances_no_negativos', '"monto" >= 0')
@Entity('supplier_advances')
export class SupplierAdvance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Proveedor, { eager: true })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor: Proveedor;

  @Index()
  @Column({ name: 'proveedor_id' })
  proveedorId: string;

  /** Lo entregado originalmente. No cambia. */
  @Column({ type: 'decimal', precision: 14, scale: 2 })
  monto: number;

  /** Lo que queda por consumir. Baja con cada imputación. */
  @Column({ type: 'decimal', precision: 14, scale: 2 })
  saldo: number;

  /** De qué caja salió. Las imputaciones futuras se registran contra ella. */
  @ManyToOne(() => Wallet, { eager: true })
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({ name: 'wallet_id' })
  walletId: string;

  /** Asiento del ledger del egreso original. */
  @Column({ type: 'uuid', nullable: true })
  wallet_movement_id?: string;

  @Column({ type: 'varchar', length: 250, nullable: true })
  notas?: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'empleado_id' })
  empleado?: User;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'company_id', nullable: true })
  companyId: string;
}
