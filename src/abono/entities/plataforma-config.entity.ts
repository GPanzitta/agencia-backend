import { Column, Entity, PrimaryColumn } from 'typeorm';

/** `numeric` llega de Postgres como texto. */
const aNumero = { to: (v: number) => v, from: (v: string | number) => Number(v) };

/**
 * Valores del abono que el dueño de la plataforma edita desde el panel, sin
 * tocar código ni volver a publicar (spec 2026-10-28 §11.2). Una sola fila.
 */
@Entity('plataforma_config')
export class PlataformaConfig {
  @PrimaryColumn({ type: 'int' })
  id: number;

  /** Vale para las suscripciones nuevas: MP sigue cobrando el monto de las que ya existen. */
  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: aNumero })
  precio_mensual: number;

  @Column({ type: 'int' })
  tope_ordenes_gratis: number;

  @Column({ type: 'int' })
  dias_gracia: number;
}
