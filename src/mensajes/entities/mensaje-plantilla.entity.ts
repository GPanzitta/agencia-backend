import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Company } from '../../companies/entities/company.entity';
import type { CanalPlantilla, ContextoPlantilla } from '../plantilla.util';

/**
 * Un mensaje de WhatsApp que la agencia puede editar.
 *
 * `clave` no nula = mensaje del sistema: existe uno por cada situación que el
 * software sabe detectar, no se borra y no cambia de clave ni de contexto
 * (si desapareciera, el aviso automático se quedaría mudo). `clave` nula =
 * mensaje propio dla agencia, que se crea, se edita y se borra libremente.
 *
 * `contexto` decide qué variables tiene derecho a usar el texto y en qué
 * selector aparece; por eso tampoco se puede cambiar en las del sistema.
 */
/*
 * Los nombres de los índices y de la FK son LITERALES y coinciden uno a uno
 * con los que crea `migrations/1788100000000-MensajesPlantillas.ts`. No es
 * cosmética: en desarrollo la app levanta con `synchronize: true`, y todo lo
 * que está en la base pero no en la metadata de la entidad es candidato a
 * DROP. Con la entidad muda, un `start:dev` sobre una base ya migrada borraba
 * la FK y —peor— el único parcial `(company_id, clave)`, que es el invariante
 * del que depende `textoPorClave`: hace un `findOneBy` asumiendo una sola
 * fila por clave. Declarado acá, las dos bases (la migrada y la sincronizada)
 * convergen en el mismo esquema.
 */
@Entity('mensaje_plantillas')
@Index('IDX_mensaje_plantillas_selector', ['companyId', 'contexto', 'activa'])
@Index('UQ_mensaje_plantillas_company_clave', ['companyId', 'clave'], {
  unique: true,
  where: '"clave" IS NOT NULL',
})
export class MensajePlantilla {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Borrar la agencia se lleva sus plantillas: son suyas y no le sirven a
   * nadie más. Sin el CASCADE quedarían filas huérfanas apuntando a una
   * empresa que ya no existe.
   */
  @ManyToOne(() => Company, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id', foreignKeyConstraintName: 'FK_mensaje_plantillas_company' })
  company?: Company;

  @Index('IDX_mensaje_plantillas_company')
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId?: string | null;

  /**
   * Nula en las dla agencia: en Postgres los NULL no chocan entre sí, así que
   * el único parcial `(company_id, clave)` de la clase restringe solo a las
   * del sistema — una sola `os_listo` por taller.
   */
  @Column({ type: 'varchar', length: 40, nullable: true })
  clave?: string | null;

  @Column({ type: 'varchar', length: 80 })
  nombre: string;

  @Column({ type: 'text' })
  texto: string;

  /**
   * `varchar` y no `enum` de Postgres, como `turnos.tipo` y `turnos.estado`:
   * sumar un contexto no debería necesitar un `ALTER TYPE`.
   */
  @Column({ type: 'varchar', length: 10, default: 'interesado' })
  contexto: ContextoPlantilla;

  /** WhatsApp o correo: cada canal tiene su selector. Las de correo llevan asunto. */
  @Column({ type: 'varchar', length: 10, default: 'whatsapp' })
  canal: CanalPlantilla;

  /** Asunto del correo, con las mismas variables que el texto. Sólo canal 'email'. */
  @Column({ type: 'varchar', length: 150, nullable: true })
  asunto?: string | null;

  /** Desactivar la esconde del selector; el aviso automático la sigue usando. */
  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @Column({ type: 'int', default: 0 })
  orden_visual: number;

  /**
   * Los documentos que la plantilla tilda sola en el modal de correo (spec
   * 2026-10-07 §3.3). Sólo cuentan en las de canal `email` y contexto `orden`.
   */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  adjuntos_sugeridos: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at: Date;
}
