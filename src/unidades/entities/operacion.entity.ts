import {
  Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

import { Company } from '../../companies/entities/company.entity';
import { User } from '../../auth/entities/user.entity';
import type { Moneda } from './unidad.entity';
import { Unidad } from './unidad.entity';
import { OperacionPago } from './operacion-pago.entity';

export type EstadoOperacion = 'reservada' | 'vendida' | 'anulada';

export interface FotoDeOperacion {
  id: string;
  url: string;
  url_miniatura: string;
  nota: string | null;
  etapa: string;
  autor: string | null;
  fecha: string;
}

/**
 * La venta de una unidad, desde la reserva con seña hasta el cierre. Los pagos
 * pueden ser mixtos y en dos monedas; un usado en parte de pago es un pago más.
 */
// Espejo de la migración 1790000000023-Operaciones.
@Check('CHK_operaciones_estado', `"estado" IN ('reservada', 'vendida', 'anulada')`)
@Check('CHK_operaciones_montos', `"precio" > 0 AND "moneda" IN ('ARS', 'USD') AND ("comision" IS NULL OR "comision" >= 0)`)
@Entity('operaciones')
@Index(['companyId', 'estado'])
@Index(['unidadId'])
@Index('UQ_operaciones_numero', ['companyId', 'numero'], { unique: true })
// Una unidad no puede tener dos operaciones vivas a la vez.
@Index('UQ_operaciones_unidad_viva', ['unidadId'], { unique: true, where: `"estado" IN ('reservada', 'vendida')` })
export class Operacion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** OP-2026-0001. */
  @Column({ type: 'varchar', length: 20 })
  numero: string;

  @ManyToOne(() => Unidad, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unidad_id' })
  unidad?: Unidad;

  @Column({ name: 'unidad_id', type: 'uuid' })
  unidadId: string;

  @Column({ type: 'varchar', length: 10, default: 'reservada' })
  estado: EstadoOperacion;

  @Column({ type: 'varchar', length: 120 })
  cliente_nombre: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  cliente_telefono: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cliente_documento: string | null;

  /** El precio acordado, en la moneda de la operación (la de la unidad al reservar). */
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  precio: number;

  @Column({ type: 'varchar', length: 3 })
  moneda: Moneda;

  /** Hasta cuándo se guarda la unidad con la seña. AAAA-MM-DD. */
  @Column({ type: 'date', nullable: true })
  reserva_vence: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vendedor_id' })
  vendedor?: User | null;

  @Column({ name: 'vendedor_id', type: 'uuid', nullable: true })
  vendedorId: string | null;

  /** Lo que se le reconoce al vendedor por la venta, en la moneda de la operación. */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  comision: number | null;

  /** Cuándo se le pagó la comisión al vendedor. Vacío = se le debe. Migración 1790000000030. */
  @Column({ type: 'timestamptz', nullable: true })
  comision_pagada_at: Date | null;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  /** Fotos y comprobantes adjuntos a la Orden de Venta (OV): señas, peritajes, entrega, 08. */
  @Column({ type: 'jsonb', default: [] })
  fotos: FotoDeOperacion[];

  @Column({ type: 'timestamptz', nullable: true })
  cerrada_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  anulada_at: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  anulada_motivo: string | null;

  @OneToMany(() => OperacionPago, (p) => p.operacion)
  pagos?: OperacionPago[];

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
