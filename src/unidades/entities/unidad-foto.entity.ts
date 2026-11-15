import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { Unidad } from './unidad.entity';

@Entity('unidades_fotos')
@Index(['unidadId'])
export class UnidadFoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Unidad, (u) => u.fotos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unidad_id' })
  unidad?: Unidad;

  @Column({ name: 'unidad_id', type: 'uuid' })
  unidadId: string;

  @Column({ type: 'varchar', length: 300 })
  url: string;

  @Column({ type: 'varchar', length: 300 })
  url_miniatura: string;

  /** La primera (orden más bajo) es la portada. */
  @Column({ type: 'int', default: 0 })
  orden: number;

  @Column({ name: 'autor_id', type: 'uuid', nullable: true })
  autorId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
