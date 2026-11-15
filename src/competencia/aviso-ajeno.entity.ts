import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { PuntoDePrecio } from './historia.util';

/**
 * Un aviso de otro vendedor, con su historia (14/11/2026): cuándo se vio por primera vez, cada
 * cambio de precio y cuándo dejó de publicarse. Espejo de la migración 1790000000034.
 */
@Entity('avisos_ajenos')
@Index('UQ_avisos_ajenos_clave', ['competidorId', 'clave'], { unique: true })
@Index('IDX_avisos_ajenos_empresa', ['companyId', 'activo'])
export class AvisoAjeno {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'competidor_id', type: 'uuid' })
  competidorId: string;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId?: string;

  @Column({ type: 'varchar', length: 500 })
  clave: string;

  @Column({ type: 'varchar', length: 160 })
  titulo: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  marca: string | null;

  @Column({ type: 'int', nullable: true })
  anio: number | null;

  @Column({ type: 'int', nullable: true })
  km: number | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  detalle: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  url: string | null;

  @Column({ type: 'varchar', length: 3 })
  moneda: 'ARS' | 'USD';

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  precio: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  precio_anterior: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  cambio_at: Date | null;

  @Column({ type: 'jsonb', default: [] })
  historia: PuntoDePrecio[];

  @Column({ type: 'timestamptz' })
  primera_vez_at: Date;

  @Column({ type: 'timestamptz' })
  ultima_vez_at: Date;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  desaparecio_at: Date | null;
}
