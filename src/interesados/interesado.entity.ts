import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { Company } from '../companies/entities/company.entity';

export type OrigenInteresado = 'salon' | 'whatsapp' | 'telefono' | 'sitio' | 'mercado_libre' | 'referido' | 'otro';
export type EtapaInteresado = 'nuevo' | 'contactado' | 'visita' | 'negociando' | 'ganado' | 'perdido';
export type Temperatura = 'frio' | 'tibio' | 'caliente';

/** Una foto que mandó desde el sitio (de su usado). */
export interface FotoDeInteresado {
  url: string;
  url_miniatura: string;
}

export interface GuiaDelUsado {
  uso: string | null;
  guardado: string | null;
  motivo_venta: string | null;
  ultimo_service: string | null;
  ultima_vtv: string | null;
  mantenimiento: string | null;
  neumaticos: string | null;
  transferencia: string | null;
  agregados: string | null;
  paneles_choques: string | null;
  reparaciones: string | null;
}

export interface UsadoDelInteresado {
  tipo_vehiculo?: string | null;
  carroceria?: string | null;
  dominio?: string | null;
  marca: string;
  modelo: string;
  version: string | null;
  anio: number;
  km: number | null;
  combustible: string | null;
  transmision: string | null;
  seguro_cuota?: number | null;
  seguro_cobertura?: string | null;
  seguro_compania?: string | null;
  costo_patente?: number | null;
  radicacion?: string | null;
  descripcion?: string | null;
  guia?: GuiaDelUsado | null;
}

export interface NotaDeSeguimiento {
  /** ISO. */
  fecha: string;
  texto: string;
  autor: string | null;
}

/**
 * Alguien que consultó por un auto o que está buscando uno (tanda de la demo,
 * 12/11/2026). Guarda por qué unidad preguntó y qué busca, para avisar cuando
 * entra al stock algo que le sirve, y cuándo hay que volver a hablarle.
 */
// Espejo de la migración 1790000000024-Interesados.
@Check('CHK_interesados_origen', `"origen" IN ('salon', 'whatsapp', 'telefono', 'sitio', 'mercado_libre', 'referido', 'otro')`)
@Check('CHK_interesados_etapa', `"etapa" IN ('nuevo', 'contactado', 'visita', 'negociando', 'ganado', 'perdido')`)
@Check('CHK_interesados_temperatura', `"temperatura" IN ('frio', 'tibio', 'caliente')`)
@Check('CHK_interesados_precio', `("precio_max" IS NULL OR "precio_max" > 0) AND ("precio_moneda" IS NULL OR "precio_moneda" IN ('ARS', 'USD'))`)
@Check('CHK_interesados_cotizacion', `("cotizacion_valor" IS NULL OR "cotizacion_valor" > 0) AND ("cotizacion_moneda" IS NULL OR "cotizacion_moneda" IN ('ARS', 'USD'))`)
@Entity('interesados')
@Index(['companyId', 'etapa'])
export class Interesado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  telefono: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 14, default: 'salon' })
  origen: OrigenInteresado;

  @Column({ type: 'varchar', length: 12, default: 'nuevo' })
  etapa: EtapaInteresado;

  @Column({ type: 'varchar', length: 8, default: 'tibio' })
  temperatura: Temperatura;

  /** La unidad por la que consultó, si consultó por una. */
  @Column({ name: 'unidad_id', type: 'uuid', nullable: true })
  unidadId: string | null;

  /** Lo que busca, con sus palabras. */
  @Column({ type: 'text', nullable: true })
  busca: string | null;

  /** Lo que busca, en datos que se pueden cruzar contra el stock. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  busca_marca: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  busca_carroceria: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  precio_max: number | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  precio_moneda: 'ARS' | 'USD' | null;

  /** El auto que entregaría en parte de pago. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  tiene_usado: string | null;

  /** Cuándo hay que volver a hablarle. AAAA-MM-DD. */
  @Column({ type: 'date', nullable: true })
  proxima_accion: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  proxima_nota: string | null;

  @Column({ name: 'vendedor_id', type: 'uuid', nullable: true })
  vendedorId: string | null;

  @Column({ type: 'jsonb', default: [] })
  seguimiento: NotaDeSeguimiento[];

  /** Su auto en datos sueltos (lo que cargó en «Cotizá tu auto»), para pasarlo al stock sin volver a tipearlo. Migración 1790000000029. */
  @Column({ type: 'jsonb', nullable: true })
  usado: UsadoDelInteresado | null;

  /** Pidió que le coticen su auto (desde «Cotizá tu auto» del sitio). Espejo de la migración 1790000000027. */
  @Column({ type: 'boolean', default: false })
  cotizacion_pedida: boolean;

  /** Lo que la agencia le ofreció por su auto. Vacío mientras no se le contestó. */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  cotizacion_valor: number | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  cotizacion_moneda: 'ARS' | 'USD' | null;

  /** Cuándo se le cotizó. AAAA-MM-DD. */
  @Column({ type: 'date', nullable: true })
  cotizacion_fecha: string | null;

  /** Las fotos del auto que ofrece, mandadas desde «Vendé tu auto». Espejo de la migración 1790000000026. */
  @Column({ type: 'jsonb', default: [] })
  fotos: FotoDeInteresado[];

  @Column({ type: 'varchar', length: 200, nullable: true })
  motivo_perdida: string | null;

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
