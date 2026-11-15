import { Publicacion } from '../publicacion.util';
import {
  Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

import { Company } from '../../companies/entities/company.entity';
import { User } from '../../auth/entities/user.entity';
import { UnidadGasto } from './unidad-gasto.entity';
import { UnidadFoto } from './unidad-foto.entity';

export type Moneda = 'ARS' | 'USD';
export type CondicionUnidad = 'usado' | '0km';
export type OrigenUnidad = 'compra' | 'toma' | 'consignacion';
export type EstadoUnidad = 'ingreso' | 'alistaje' | 'disponible' | 'reservada' | 'vendida' | 'devuelta' | 'baja';
export type EstadoPapel = 'falta' | 'en_tramite' | 'ok';

export interface Papel {
  estado: EstadoPapel;
  /** AAAA-MM-DD. Sólo para los que vencen (VTV, informe de dominio). */
  vence?: string | null;
  nota?: string | null;
}

/**
 * Un auto de la agencia: un solo ejemplar, con dominio. Es el corazón del
 * producto (diseño del 12/11/2026): se compra, se toma en parte de pago o se
 * recibe en consignación; se alista, se publica, se reserva y se vende.
 */
// Espejo de la migración 1790000000022-Agencia.
@Check('CHK_unidades_condicion', `"condicion" IN ('usado', '0km')`)
@Check('CHK_unidades_origen', `"origen" IN ('compra', 'toma', 'consignacion')`)
@Check('CHK_unidades_estado', `"estado" IN ('ingreso', 'alistaje', 'disponible', 'reservada', 'vendida', 'devuelta', 'baja')`)
@Check('CHK_unidades_moneda', `"moneda" IN ('ARS', 'USD')`)
@Check('CHK_unidades_montos', `"costo_adquisicion" >= 0 AND ("precio_piso" IS NULL OR "precio_piso" >= 0) AND ("precio_venta" IS NULL OR "precio_venta" > 0)`)
@Check('CHK_unidades_anio_km', `"anio" BETWEEN 1900 AND 2100 AND "km" >= 0`)
@Check('CHK_unidades_publicada', `NOT "publicada" OR ("estado" IN ('disponible', 'reservada') AND "precio_venta" IS NOT NULL)`)
@Entity('unidades')
@Index(['companyId', 'estado'])
@Index('UQ_unidades_numero', ['companyId', 'numero'], { unique: true })
// Un mismo dominio no puede estar dos veces en stock; sí puede volver a entrar después de vendido.
@Index('UQ_unidades_dominio_en_stock', ['companyId', 'dominio'], { unique: true, where: `"dominio" IS NOT NULL AND "estado" IN ('ingreso', 'alistaje', 'disponible', 'reservada')` })
export class Unidad {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** U-0001. */
  @Column({ type: 'varchar', length: 12 })
  numero: string;

  /** Patente, sin espacios y en mayúsculas. Un 0 km puede no tenerla todavía. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  dominio: string | null;

  @Column({ type: 'varchar', length: 60 })
  marca: string;

  @Column({ type: 'varchar', length: 80 })
  modelo: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  version: string | null;

  @Column({ type: 'smallint' })
  anio: number;

  @Column({ type: 'int', default: 0 })
  km: number;

  @Column({ type: 'varchar', length: 40, nullable: true })
  color: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  combustible: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  transmision: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  carroceria: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  nro_motor: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  nro_chasis: string | null;

  @Column({ type: 'varchar', length: 6, default: 'usado' })
  condicion: CondicionUnidad;

  @Column({ type: 'varchar', length: 14 })
  origen: OrigenUnidad;

  @Column({ type: 'varchar', length: 12, default: 'ingreso' })
  estado: EstadoUnidad;

  /** La moneda de la unidad: en esta se expresan el precio, el costo total y el margen. */
  @Column({ type: 'varchar', length: 3, default: 'USD' })
  moneda: Moneda;

  /** Lo pagado al comprarla o lo reconocido al tomarla. Cero en consignación. */
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  costo_adquisicion: number;

  /** Consignación: lo mínimo que hay que liquidarle al dueño. */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  precio_piso: number | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  precio_venta: number | null;

  /** A quién se le compró, quién la entregó en parte de pago o quién la dejó en consignación. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  titular_nombre: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  titular_telefono: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  titular_documento: string | null;

  /** Toma: la operación de venta en la que entró como parte de pago. */
  @Column({ name: 'operacion_origen_id', type: 'uuid', nullable: true })
  operacionOrigenId: string | null;

  @Column({ type: 'jsonb', default: {} })
  papeles: Record<string, Papel>;

  @Column({ type: 'boolean', default: false })
  publicada: boolean;

  /** Lo que lee el cliente en el sitio. */
  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  ubicacion: string | null;

  /** Equipamiento, características, colores y opciones de compra de la publicación. Espejo de la migración 1790000000032. */
  @Column({ type: 'jsonb', nullable: true })
  publicacion: Publicacion | null;

  /** Interno: nunca sale al sitio. */
  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  fecha_ingreso: string;

  @Column({ type: 'date', nullable: true })
  fecha_venta: string | null;

  @OneToMany(() => UnidadGasto, (g) => g.unidad)
  gastos?: UnidadGasto[];

  @OneToMany(() => UnidadFoto, (f) => f.unidad)
  fotos?: UnidadFoto[];

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
