import { Check, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import type { Moneda } from './unidad.entity';
import { Operacion } from './operacion.entity';

export type MedioPagoOperacion = 'efectivo' | 'transferencia' | 'cheque' | 'credito' | 'usado' | 'otro';

/** Un pago de la operación: la seña, una transferencia, el crédito prendario, el usado que se toma. */
@Check('CHK_operaciones_pagos_medio', `"medio" IN ('efectivo', 'transferencia', 'cheque', 'credito', 'usado', 'otro')`)
@Check('CHK_operaciones_pagos_monto', `"monto" > 0 AND "moneda" IN ('ARS', 'USD') AND ("tipo_cambio" IS NULL OR "tipo_cambio" > 0)`)
@Entity('operaciones_pagos')
export class OperacionPago {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Operacion, (o) => o.pagos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'operacion_id' })
  operacion?: Operacion;

  @Column({ name: 'operacion_id', type: 'uuid' })
  operacionId: string;

  @Column({ type: 'varchar', length: 14 })
  medio: MedioPagoOperacion;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  monto: number;

  @Column({ type: 'varchar', length: 3 })
  moneda: Moneda;

  /** Pesos por dólar el día del pago. Obligatorio si la moneda no es la de la operación. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  tipo_cambio: number | null;

  /** La billetera a la que entró la plata (si se asentó). */
  @Column({ name: 'wallet_id', type: 'uuid', nullable: true })
  walletId: string | null;

  /** Medio «usado»: la unidad que entró al stock como parte de pago. */
  @Column({ name: 'unidad_toma_id', type: 'uuid', nullable: true })
  unidadTomaId: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  detalle: string | null;

  @Column({ name: 'autor_id', type: 'uuid', nullable: true })
  autorId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
