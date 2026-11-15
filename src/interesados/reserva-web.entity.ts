import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type EstadoReservaWeb = 'pendiente' | 'confirmada' | 'rechazada' | 'vencida';

/**
 * Un pedido de reserva hecho desde el sitio (13/11/2026). El cliente deja sus
 * datos y transfiere la seña; mientras está pendiente nadie más puede pedir el
 * mismo auto por el sitio. La unidad recién pasa a «reservada» cuando la
 * agencia confirma que la seña llegó: ahí nace la operación.
 */
// Espejo de la migración 1790000000030-ReservaWebYComisiones.
@Check('CHK_reservas_web', `"estado" IN ('pendiente', 'confirmada', 'rechazada', 'vencida') AND "monto" > 0 AND "moneda" IN ('ARS', 'USD')`)
@Entity('reservas_web')
@Index('IDX_reservas_web_empresa', ['companyId', 'estado'])
@Index('UQ_reservas_web_token', ['token'], { unique: true })
@Index('UQ_reservas_web_unidad_pendiente', ['unidadId'], { unique: true, where: `"estado" = 'pendiente'` })
export class ReservaWeb {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Lo que viaja en el enlace del cliente: no es el id. */
  @Column({ type: 'uuid', default: () => 'gen_random_uuid()' })
  token: string;

  @Column({ name: 'unidad_id', type: 'uuid' })
  unidadId: string;

  @Column({ type: 'varchar', length: 12, default: 'pendiente' })
  estado: EstadoReservaWeb;

  @Column({ type: 'varchar', length: 120 })
  cliente_nombre: string;

  @Column({ type: 'varchar', length: 40 })
  cliente_telefono: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cliente_documento: string | null;

  /** La seña que se le pidió, como estaba configurada ese día. */
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  monto: number;

  @Column({ type: 'varchar', length: 3 })
  moneda: 'ARS' | 'USD';

  /** Hasta cuándo tiene para transferir. */
  @Column({ type: 'timestamptz' })
  vence_at: Date;

  /** Cuántos días se le guarda el auto una vez confirmada la seña. */
  @Column({ type: 'int', default: 7 })
  dias: number;

  @Column({ name: 'operacion_id', type: 'uuid', nullable: true })
  operacionId: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  motivo: string | null;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
