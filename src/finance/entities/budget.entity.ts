import {
  Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index, Unique, CreateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { CategoriaGasto } from '../../expenses/entities/expense.enums';

/**
 * Cuanto se decidio gastar en una categoria durante un mes.
 *
 * El periodo se guarda como primer dia del mes: un presupuesto que abarca
 * rangos arbitrarios es imposible de comparar mes contra mes.
 */
@Entity('budgets')
@Unique(['categoria', 'periodo', 'companyId'])
export class Budget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: CategoriaGasto })
  categoria: CategoriaGasto;

  /** Primer dia del mes presupuestado. */
  @Index()
  @Column({ type: 'date' })
  periodo: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  monto_asignado: number;

  /**
   * Porcentaje a partir del cual avisar. 80 = avisar al consumir el 80%.
   * Avisar recien al pasarse no sirve: cuando te enteras ya gastaste de mas.
   */
  @Column({ type: 'int', default: 80 })
  umbral_alerta: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'company_id', nullable: true })
  companyId: string;
}
