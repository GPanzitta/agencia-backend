import {
  Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Proveedor } from '../../proveedores/entities/proveedore.entity';
import { Company } from '../../companies/entities/company.entity';
import { CategoriaGasto, MetodoPagoGasto } from '../../expenses/entities/expense.enums';

export enum Frecuencia {
  SEMANAL = 'semanal',
  QUINCENAL = 'quincenal',
  MENSUAL = 'mensual',
  BIMESTRAL = 'bimestral',
  TRIMESTRAL = 'trimestral',
  ANUAL = 'anual',
}

/**
 * Plantilla de un gasto que se repite: alquiler, sueldos, internet, seguros.
 *
 * Existe porque hoy esos gastos se cargan a mano todos los meses, y lo que se
 * carga a mano se olvida. Un alquiler no registrado no aparece en la proyeccion
 * de pagos, y el mes cierra mostrando una ganancia que no existe.
 *
 * No genera el gasto como pagado: lo genera PENDIENTE con su vencimiento, para
 * que entre en cuentas por pagar como cualquier otro.
 */
@Entity('recurring_expenses')
export class RecurringExpense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  descripcion: string;

  @Column({ type: 'enum', enum: CategoriaGasto })
  categoria: CategoriaGasto;

  /** Monto esperado. El gasto generado se puede editar si vino distinto. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  monto: number;

  @Column({ type: 'enum', enum: MetodoPagoGasto })
  metodo_pago: MetodoPagoGasto;

  @ManyToOne(() => Proveedor, { eager: true, nullable: true })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor?: Proveedor;

  @Column({ type: 'enum', enum: Frecuencia })
  frecuencia: Frecuencia;

  /**
   * Dia del mes en que vence (1-31). Si el mes no tiene ese dia, se usa el
   * ultimo: un vencimiento el 31 no puede desaparecer en febrero.
   */
  @Column({ type: 'int', default: 1 })
  dia_vencimiento: number;

  @Column({ type: 'date' })
  fecha_inicio: Date;

  /** Sin fecha de fin, se repite indefinidamente. */
  @Column({ type: 'date', nullable: true })
  fecha_fin?: Date | null;

  /** Proxima fecha a generar. Es el reloj de la plantilla. */
  @Index()
  @Column({ type: 'date' })
  proxima_generacion: Date;

  @Column({ type: 'date', nullable: true })
  ultima_generacion?: Date;

  @Column({ type: 'int', default: 0 })
  generados: number;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ type: 'text', nullable: true })
  notas?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'company_id', nullable: true })
  companyId: string;
}
