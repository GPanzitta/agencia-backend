import {
  Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

import { Company } from '../../companies/entities/company.entity';
import { User } from '../../auth/entities/user.entity';
import type { Moneda } from '../../unidades/entities/unidad.entity';
import { OrdenAlistaje } from './orden-alistaje.entity';

export type EstadoOrdenCompraTaller = 'pendiente' | 'recibida' | 'cancelada';

export interface ItemOrdenCompraTaller {
  id: string;
  repuesto_id: string | null;
  renglon_orden_id: string | null;
  codigo: string | null;
  nombre: string;
  cantidad_pedida: number;
  cantidad_recibida: number;
  costo_unitario: number;
}

/**
 * Orden de Compra de Repuestos (OC-2026-0001): puede nacer atada a una Orden de
 * Alistaje / Taller (`ordenId`) para cubrir los repuestos faltantes de ese auto,
 * o como reposición general del pañol.
 *
 * Al marcarse como «recibida»:
 * 1. Suma `cantidad_recibida` al `stock` de cada `RepuestoAuto` en el pañol (y actualiza su costo),
 * 2. Si está atada a una `OrdenAlistaje`, marca sus renglones vinculados como `ingresado = true`
 *    (y si se pide `consumir_en_orden`, también los consume de inmediato descontando ese stock).
 */
@Check('CHK_ordenes_compra_taller_total', `"monto_total" >= 0`)
@Entity('ordenes_compra_taller')
@Index(['companyId', 'estado'])
@Index(['ordenId'])
@Index('UQ_ordenes_compra_taller_numero', ['companyId', 'numero'], { unique: true })
export class OrdenCompraTaller {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** OC-2026-0001. */
  @Column({ type: 'varchar', length: 20 })
  numero: string;

  @ManyToOne(() => OrdenAlistaje, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'orden_id' })
  orden?: OrdenAlistaje | null;

  @Column({ name: 'orden_id', type: 'uuid', nullable: true })
  ordenId: string | null;

  @Column({ type: 'varchar', length: 140 })
  proveedor: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  numero_remito: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pendiente' })
  estado: EstadoOrdenCompraTaller;

  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  moneda: Moneda;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  monto_total: number;

  @Column({ type: 'jsonb', default: [] })
  items: ItemOrdenCompraTaller[];

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  recibida_at: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'autor_id' })
  autor?: User | null;

  @Column({ name: 'autor_id', type: 'uuid', nullable: true })
  autorId: string | null;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
