import {
  Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

import { Company } from '../../companies/entities/company.entity';
import type { Moneda } from '../../unidades/entities/unidad.entity';

export type CategoriaRepuestoAuto =
  | 'filtros_fluidos'
  | 'frenos_suspension'
  | 'distribucion_motor'
  | 'neumaticos_llantas'
  | 'baterias_electricidad'
  | 'estetica_detailing'
  | 'chapa_pintura'
  | 'accesorios_seguridad'
  | 'otro';

export interface FotoRepuestoAuto {
  id: string;
  url: string;
  url_miniatura: string;
  fecha: string;
}

/**
 * Un repuesto o insumo del pañol de la agencia (filtros, kits de distribución,
 * baterías, neumáticos, pastillas de freno, kits de estética, matafuegos, etc.).
 * Adaptado del sistema de Taller al dominio automotriz.
 */
@Check('CHK_repuestos_auto_montos', `"costo" >= 0 AND "stock" >= 0 AND "stock_minimo" >= 0`)
@Entity('repuestos_auto')
@Index(['companyId', 'activo'])
export class RepuestoAuto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** SKU o código de parte: ej. "FIL-VW-200TSI", "BAT-MOU-65A". */
  @Column({ type: 'varchar', length: 60, nullable: true })
  codigo: string | null;

  @Column({ type: 'varchar', length: 140 })
  nombre: string;

  @Column({ type: 'varchar', length: 40, default: 'filtros_fluidos' })
  categoria: CategoriaRepuestoAuto;

  /** Marca del repuesto (Bosch, Moura, Michelin, Mann Filter, Original VW...). */
  @Column({ type: 'varchar', length: 60, nullable: true })
  marca: string | null;

  /** Modelos compatibles: ej. "VW Nivus / T-Cross / Polo 1.0 TSI". */
  @Column({ type: 'varchar', length: 160, nullable: true })
  compatibilidad: string | null;

  /** Estante o sector en el pañol de la agencia: ej. "Estante A-2". */
  @Column({ type: 'varchar', length: 60, nullable: true })
  ubicacion: string | null;

  @Column({ type: 'varchar', length: 20, default: 'un' })
  unidad_medida: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  stock: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 1 })
  stock_minimo: number;

  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  moneda: Moneda;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  costo: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  proveedor: string | null;

  /** Fotos del repuesto (hasta 8, comprimidas en WebP). La primera es la miniatura de portada. */
  @Column({ type: 'jsonb', default: [] })
  fotos: FotoRepuestoAuto[];

  @Column({ type: 'boolean', default: true })
  activo: boolean;

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
