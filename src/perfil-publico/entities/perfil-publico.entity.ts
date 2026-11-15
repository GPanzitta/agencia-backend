import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

import { Company } from '../../companies/entities/company.entity';
import type { SintomaConfig } from '../sintomas.util';
import type { FotosSitioGuardadas } from '../fotos-sitio';

/** `fuego` es el degradé del logo de GUSMAT, #EB0100 → #FF7801 (spec del portal 2026-09-27 §5). */
export const ACENTOS = ['amarillo', 'naranja', 'celeste', 'verde', 'rojo', 'violeta', 'fuego'] as const;
export type Acento = (typeof ACENTOS)[number];

export const ICONOS_SERVICIO = [
  'lavarropas', 'heladera', 'microondas', 'aire', 'cocina', 'secarropas', 'lavavajillas', 'herramienta',
] as const;
export type IconoServicio = (typeof ICONOS_SERVICIO)[number];

export interface Horario { dias: string; desde: string; hasta: string }
export interface Redes { instagram?: string; facebook?: string; tiktok?: string; sitio?: string }
export interface Servicio { nombre: string; frase: string; icono: IconoServicio }
export interface FotoTrabajo { url: string; miniatura: string; pie?: string }
export interface Cifras { reparaciones?: number; opiniones?: number; garantia_dias?: number }

/** Un video de YouTube de la sección "Videos" del sitio (S1c-b §3.2). */
export interface VideoYoutube {
  /** El id de 11 caracteres; la URL se reconstruye en el ERP y en el portal. */
  id: string;
  /** El que devolvió `oembed` al agregarlo. */
  titulo: string;
  /** `author_name` de `oembed`. */
  canal: string;
  /** Lo que el taller quiere que se lea en el sitio, si cargó algo. */
  titulo_personalizado?: string;
}

/**
 * Lo que el taller muestra de sí mismo en la home del comercio (S1a §3.1).
 * Una fila por empresa; la empresa no se toca. Los archivos van al mismo
 * almacén que las fotos de órdenes, en `perfil/<company_id>`.
 *
 * El nombre de la FK y del índice único son LITERALES y coinciden con los
 * que crea `migrations/1789500000000-PerfilPublico.ts` (mismo criterio que
 * `mensaje_plantillas`, ver el comentario ahí): con `synchronize: true` en
 * desarrollo, todo lo que está en la base pero no en la metadata de la
 * entidad es candidato a DROP, y una entidad muda se llevaría puesta la FK
 * y el índice único `(company_id)` — el invariante del que depende `fila()`
 * para asumir una sola fila por empresa.
 */
@Entity('perfil_publico')
@Index('IDX_perfil_publico_company', ['companyId'], { unique: true })
export class PerfilPublico {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Borrar el taller se lleva su perfil público: no le sirve a nadie más. */
  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id', foreignKeyConstraintName: 'FK_perfil_publico_company' })
  company: Company;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  eslogan: string | null;

  @Column({ type: 'text', nullable: true })
  quienes_somos: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  zona: string | null;

  @Column({ type: 'varchar', length: 16, default: 'amarillo' })
  color_acento: Acento;

  @Column({ type: 'text', nullable: true })
  logo_url: string | null;
  /** El ícono solo (sin el nombre), para la barra del sitio. Spec 2026-10-01 §3. */
  @Column({ type: 'text', nullable: true })
  isotipo_url: string | null;

  @Column({ type: 'text', nullable: true })
  portada_url: string | null;

  @Column({ type: 'text', nullable: true })
  foto_equipo_url: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  horarios: Horario[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  redes: Redes;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  marcas: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  servicios: Servicio[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  fotos_trabajos: FotoTrabajo[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  cifras: Cifras;

  // ─── Datos del sitio (S1c-b) ───────────────────────────────────────────

  /** Video de portada, en el mismo almacén que las fotos (`perfil/<company_id>`). */
  @Column({ type: 'text', nullable: true })
  video_url: string | null;

  /**
   * El primer cuadro del video, que genera Cloudinary (`/so_0/` + `.jpg`).
   * Con almacén local queda en `null`: en desarrollo la portada hace de poster.
   */
  @Column({ type: 'text', nullable: true })
  video_poster_url: string | null;

  /** Hasta 6 videos de YouTube, en el orden que el taller eligió. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  videos: VideoYoutube[];

  /**
   * El Place ID del taller en Google, para traer las opiniones. NO es público:
   * `armarPerfilPublico` no lo copia y `PerfilPublicoRespuesta` lo excluye.
   */
  @Column({ type: 'varchar', length: 300, nullable: true })
  google_place_id: string | null;

  /**
   * Síntoma → causas → repuestos de la consola de la portada (spec 2026-10-11).
   * null = el taller nunca lo editó y rige la lista de fábrica (`sintomasVigentes`).
   */
  @Column({ type: 'jsonb', nullable: true })
  sintomas: SintomaConfig[] | null;

  /**
   * Las fotos propias de cada lugar de la portada (spec 2026-10-18): clave →
   * lista por posición, `null` = va la original. Las escriben sólo los
   * endpoints `fotos-sitio`; se leen resueltas con `resolverFotosSitio`.
   */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  fotos_sitio: FotosSitioGuardadas;

  /** El video grande de la portada; sin él, el original (`VIDEOS_ORIGINALES.portada`). */
  @Column({ type: 'text', nullable: true })
  video_portada_url: string | null;

  /**
   * «Te lo instalamos» (spec 2026-11-07 §8.3): vale para todo el taller, no
   * por producto. Apagado por defecto; la ficha del producto lo dice sólo
   * cuando el taller lo activa, con sus condiciones en `instalacion_texto`.
   */
  @Column({ type: 'boolean', default: false })
  instalacion_activa: boolean;

  @Column({ type: 'varchar', length: 200, nullable: true })
  instalacion_texto: string | null;

  /**
   * Si el taller vende repuestos. Apagado, el sitio esconde lo que sirve para
   * buscar piezas (código, marca y modelo del equipo, despieces, compatibles),
   * sin borrar nada. Prendido por defecto: es como funcionó siempre.
   */
  @Column({ type: 'boolean', default: true })
  vende_repuestos: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
