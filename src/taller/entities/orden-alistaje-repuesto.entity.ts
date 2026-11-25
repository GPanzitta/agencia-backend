import {
  Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';

import type { Moneda } from '../../unidades/entities/unidad.entity';
import { OrdenAlistaje } from './orden-alistaje.entity';
import { RepuestoAuto } from './repuesto-auto.entity';

/**
 * Un renglón de repuesto o insumo asignado a una Orden de Alistaje (OA).
 * Si está vinculado a un `RepuestoAuto` del pañol, al agregarse descuenta stock
 * y al quitarse o anularse la orden lo restituye.
 */
@Check('CHK_orden_alistaje_repuestos_montos', `"cantidad" > 0 AND "costo_unitario" >= 0`)
@Entity('ordenes_alistaje_repuestos')
@Index(['ordenId'])
export class OrdenAlistajeRepuesto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => OrdenAlistaje, (o) => o.repuestos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orden_id' })
  orden?: OrdenAlistaje;

  @Column({ name: 'orden_id', type: 'uuid' })
  ordenId: string;

  @ManyToOne(() => RepuestoAuto, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'repuesto_id' })
  repuesto?: RepuestoAuto | null;

  @Column({ name: 'repuesto_id', type: 'uuid', nullable: true })
  repuestoId: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  codigo: string | null;

  @Column({ type: 'varchar', length: 140 })
  nombre: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 1 })
  cantidad: number;

  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  moneda: Moneda;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  costo_unitario: number;

  /** true cuando el repuesto ya está disponible en el pañol (o llegó la OC vinculada). */
  @Column({ type: 'boolean', default: true })
  ingresado: boolean;

  /** true cuando el repuesto ya fue colocado/consumido en la orden y se descontó del stock físico del pañol. */
  @Column({ type: 'boolean', default: true })
  consumido: boolean;

  /** Si este renglón originó o está respaldado por una Orden de Compra (OC). */
  @Column({ name: 'compra_id', type: 'uuid', nullable: true })
  compraId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
