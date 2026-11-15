import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { UnidadAjena } from './lector.util';

/**
 * Otro vendedor de autos cuya página se mira para comparar precios
 * (14/11/2026). Guarda la última lectura. Espejo de la migración 1790000000031.
 */
@Entity('competidores')
@Index('IDX_competidores_empresa', ['companyId'])
export class Competidor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  /** Los autos leídos la última vez. */
  @Column({ type: 'jsonb', default: [] })
  unidades: UnidadAjena[];

  @Column({ name: 'leida_at', type: 'timestamptz', nullable: true })
  leida_at: Date | null;

  /** Desde cuándo hay una lectura en curso; vacío si no hay ninguna. */
  @Column({ name: 'leyendo_desde', type: 'timestamptz', nullable: true })
  leyendo_desde: Date | null;

  /** Por qué falló la última lectura, dicho para el usuario. Vacío si salió bien. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  error: string | null;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
