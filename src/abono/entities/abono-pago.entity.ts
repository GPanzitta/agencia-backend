import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

const aNumero = { to: (v: number) => v, from: (v: string | number) => Number(v) };

/** Un pago aprobado del abono. El id único hace que un aviso repetido de MP no sume dos meses. */
@Entity('abono_pagos')
export class AbonoPago {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ type: 'varchar', length: 60, unique: true })
  mp_pago_id: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: aNumero })
  monto: number;

  @Column({ type: 'timestamptz' })
  pagado_en: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
