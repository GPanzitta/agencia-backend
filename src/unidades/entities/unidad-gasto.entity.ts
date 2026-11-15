import { Check, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { User } from '../../auth/entities/user.entity';
import type { Moneda } from './unidad.entity';
import { Unidad } from './unidad.entity';

/** Un gasto de alistaje imputado a la unidad: chapa, service, cubiertas, gestoría, lavado. */
@Check('CHK_unidades_gastos_monto', `"monto" > 0 AND "moneda" IN ('ARS', 'USD') AND ("tipo_cambio" IS NULL OR "tipo_cambio" > 0)`)
@Entity('unidades_gastos')
export class UnidadGasto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Unidad, (u) => u.gastos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unidad_id' })
  unidad?: Unidad;

  @Column({ name: 'unidad_id', type: 'uuid' })
  unidadId: string;

  @Column({ type: 'varchar', length: 200 })
  descripcion: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  monto: number;

  @Column({ type: 'varchar', length: 3 })
  moneda: Moneda;

  /** Pesos por dólar el día del gasto. Obligatorio si la moneda no es la de la unidad. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  tipo_cambio: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'autor_id' })
  autor?: User | null;

  @Column({ name: 'autor_id', type: 'uuid', nullable: true })
  autorId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
