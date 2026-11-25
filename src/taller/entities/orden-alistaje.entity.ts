import {
  Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

import { Company } from '../../companies/entities/company.entity';
import { User } from '../../auth/entities/user.entity';
import type { Moneda } from '../../unidades/entities/unidad.entity';
import { Unidad } from '../../unidades/entities/unidad.entity';
import { OrdenAlistajeRepuesto } from './orden-alistaje-repuesto.entity';

export type EstadoOrdenAlistaje =
  | 'recibida'
  | 'diagnostico'
  | 'en_trabajo'
  | 'control_calidad'
  | 'lista'
  | 'anulada';

export type PrioridadOrdenAlistaje = 'normal' | 'alta' | 'urgente_entrega';
export type TipoOrigenOrdenTaller = 'stock' | 'cliente';

export interface ClienteExternoTaller {
  nombre: string;
  telefono: string | null;
  documento: string | null;
  email: string | null;
}

export interface VehiculoExternoTaller {
  dominio: string | null;
  marca: string;
  modelo: string;
  version: string | null;
  anio: number;
  km: number;
  color: string | null;
  combustible: string | null;
  transmision: string | null;
}

export interface ItemChecklistAlistaje {
  clave: string;
  grupo: 'Mecanica' | 'Seguridad' | 'Estetica' | 'Equipamiento';
  nombre: string;
  estado: 'pendiente' | 'ok' | 'reparar';
  observacion: string | null;
}

export interface FotoOrdenAlistaje {
  id: string;
  url: string;
  url_miniatura: string;
  etapa: string;
  nota: string | null;
  autor: string | null;
  fecha: string;
}

export interface EventoOrdenAlistaje {
  fecha: string;
  texto: string;
  autor: string | null;
}

/**
 * Orden de Alistaje y Taller de una Unidad (OA-2026-0001): adapta las Órdenes
 * de Servicio de Taller al reacondicionamiento de vehículos de la agencia.
 *
 * Incluye:
 * - Checklist de inspección multipunto (mecánica, seguridad, estética, equipamiento),
 * - Repuestos e insumos consumidos del pañol (con descuento automático de stock),
 * - Mano de obra / taller externo,
 * - Fotos de antes y después (ingreso, diagnóstico, trabajo, QA),
 * - Al cerrarse como «lista», imputa automáticamente un UnidadGasto en la ficha
 *   financiera del auto para que el costo total y el margen real queden exactos.
 */
@Check('CHK_ordenes_alistaje_mano_obra', `"costo_mano_obra" >= 0`)
@Entity('ordenes_alistaje')
@Index(['companyId', 'estado'])
@Index(['unidadId'])
@Index('UQ_ordenes_alistaje_numero', ['companyId', 'numero'], { unique: true })
export class OrdenAlistaje {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** OA-2026-0001. */
  @Column({ type: 'varchar', length: 20 })
  numero: string;

  /** 'stock' = unidad propia/consignación de la agencia; 'cliente' = vehículo de un cliente particular que viene al taller. */
  @Column({ type: 'varchar', length: 14, default: 'stock' })
  tipo_origen: TipoOrigenOrdenTaller;

  @ManyToOne(() => Unidad, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unidad_id' })
  unidad?: Unidad | null;

  @Column({ name: 'unidad_id', type: 'uuid', nullable: true })
  unidadId: string | null;

  /** Datos del cliente cuando `tipo_origen === 'cliente'`. */
  @Column({ type: 'jsonb', nullable: true })
  cliente_externo: ClienteExternoTaller | null;

  /** Datos del auto cuando `tipo_origen === 'cliente'`. */
  @Column({ type: 'jsonb', nullable: true })
  vehiculo_externo: VehiculoExternoTaller | null;

  @Column({ type: 'varchar', length: 20, default: 'recibida' })
  estado: EstadoOrdenAlistaje;

  @Column({ type: 'varchar', length: 20, default: 'normal' })
  prioridad: PrioridadOrdenAlistaje;

  /** Mecánica general, Chapa y pintura, Service de ingreso, Detailing / Estética, Pre-entrega... */
  @Column({ type: 'varchar', length: 60, default: 'Service y alistaje de ingreso' })
  sector: string;

  /** Mecánico interno o taller/chapista asignado. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  responsable: string | null;

  /** Qué se pidió revisar o qué se detectó al ingresar el auto. */
  @Column({ type: 'text' })
  falla_motivo: string;

  /** Qué encontró el mecánico / chapista al revisarlo. */
  @Column({ type: 'text', nullable: true })
  diagnostico: string | null;

  /** Qué trabajos se le realizaron. */
  @Column({ type: 'text', nullable: true })
  trabajo_realizado: string | null;

  @Column({ type: 'int', nullable: true })
  km_ingreso: number | null;

  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  moneda: Moneda;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  costo_mano_obra: number;

  /** Tipo de cambio ARS/USD para llevar el gasto a la moneda de la unidad al finalizar. */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  tipo_cambio: number | null;

  /** Si ya impactó como UnidadGasto al finalizar la orden. */
  @Column({ name: 'gasto_unidad_id', type: 'uuid', nullable: true })
  gastoUnidadId: string | null;

  @Column({ type: 'jsonb', default: [] })
  checklist: ItemChecklistAlistaje[];

  @Column({ type: 'jsonb', default: [] })
  fotos: FotoOrdenAlistaje[];

  @Column({ type: 'jsonb', default: [] })
  bitacora: EventoOrdenAlistaje[];

  @OneToMany(() => OrdenAlistajeRepuesto, (r) => r.orden, { cascade: true })
  repuestos?: OrdenAlistajeRepuesto[];

  @Column({ type: 'timestamptz', nullable: true })
  finalizada_at: Date | null;

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
