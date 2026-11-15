import {
  Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index, UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

/**
 * Parametros financieros del local. Una fila por empresa.
 *
 * Existe para que el umbral de aprobacion no sea una constante en el codigo:
 * lo que es "un gasto grande" depende del negocio, no del programador.
 */
@Entity('finance_settings')
export class FinanceSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Monto a partir del cual un gasto necesita aprobacion.
   * 0 = sin aprobaciones, todo queda aprobado al crearse.
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  umbral_aprobacion: number;

  /** Avisar cuando el saldo de una billetera baja de esto. 0 = no avisar. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  alerta_saldo_minimo: number;

  /** Dias de anticipacion con los que avisar un vencimiento. */
  @Column({ type: 'int', default: 3 })
  dias_aviso_vencimiento: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index({ unique: true })
  @Column({ name: 'company_id', nullable: true })
  companyId: string;
}
