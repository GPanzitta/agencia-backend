import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type EstadoEnvio = 'abierto' | 'enviado' | 'fallido';

/**
 * Lo que se le escribió a un cliente (14/11/2026). Un WhatsApp queda «abierto»:
 * el sistema arma el texto y abre la conversación, pero el que aprieta enviar
 * es el vendedor. Un correo queda «enviado» o «fallido», con el motivo.
 * Espejo de la migración 1790000000033.
 */
@Entity('mensajes_enviados')
@Index('IDX_mensajes_enviados_interesado', ['interesadoId'])
@Index('IDX_mensajes_enviados_operacion', ['operacionId'])
@Index('IDX_mensajes_enviados_empresa', ['companyId', 'created_at'])
export class MensajeEnviado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  canal: 'whatsapp' | 'email';

  @Column({ name: 'interesado_id', type: 'uuid', nullable: true })
  interesadoId: string | null;

  @Column({ name: 'operacion_id', type: 'uuid', nullable: true })
  operacionId: string | null;

  /** El teléfono o el correo al que salió. */
  @Column({ type: 'varchar', length: 200 })
  para: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  asunto: string | null;

  @Column({ type: 'text' })
  cuerpo: string;

  /** El nombre de la plantilla usada, como estaba en ese momento. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  plantilla: string | null;

  @Column({ type: 'varchar', length: 10 })
  estado: EstadoEnvio;

  @Column({ type: 'varchar', length: 300, nullable: true })
  error: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  autor: string | null;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
