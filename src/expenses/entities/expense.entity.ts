import { Check, Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index, Unique, OneToMany } from 'typeorm';
import { Proveedor } from '../../proveedores/entities/proveedore.entity';
import { User } from '../../auth/entities/user.entity';
import { Company } from '../../companies/entities/company.entity';
import { ExpensePayment } from './expense-payment.entity';
import { CategoriaGasto, MetodoPagoGasto, EstadoPagoGasto, TipoComprobante, EstadoAprobacion } from './expense.enums';

// Se reexportan para no romper a quien ya los importaba desde esta entidad
// (purchase_orders, los DTOs).
export { CategoriaGasto, MetodoPagoGasto, EstadoPagoGasto, TipoComprobante, EstadoAprobacion };





// Espejo de la migración 1790000000000-IntegridadDatos (montos y cantidades no negativos).
@Check('CHK_expenses_no_negativos', '"monto" >= 0 AND "neto" >= 0 AND "iva" >= 0 AND "percepciones" >= 0 AND "monto_pagado" >= 0')
@Entity('expenses')
@Unique(['numero_gasto', 'companyId'])
export class Expense {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 20 })
    numero_gasto: string;

    @Column({ type: 'date' })
    fecha: Date;

    /** Activo o anulado. El estado de PAGO va aparte, en estado_pago. */
    @Column({ type: 'boolean', default: true })
    estado: boolean;

    @Column({ type: 'enum', enum: CategoriaGasto })
    categoria: CategoriaGasto;

    @Column({ type: 'text' })
    descripcion: string;

    /** Total del gasto. Fuente de verdad para pagos y reportes. */
    @Column({ type: 'decimal', precision: 14, scale: 2 })
    monto: number;

    // --- Composicion fiscal ---
    // El desglose es opcional: los gastos ya cargados solo tienen total, y
    // exigirles neto habria invalidado el historico. Cuando viene, el servicio
    // calcula monto = neto + iva + percepciones.

    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    neto: number;

    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    iva: number;

    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    percepciones: number;

    @Column({ type: 'enum', enum: TipoComprobante, default: TipoComprobante.SIN_COMPROBANTE })
    tipo_comprobante: TipoComprobante;

    @Column({ type: 'varchar', length: 10, nullable: true })
    punto_venta?: string;

    // --- Estado de pago ---

    @Column({ type: 'enum', enum: EstadoPagoGasto, default: EstadoPagoGasto.PENDIENTE })
    estado_pago: EstadoPagoGasto;

    /** Suma de los pagos activos. Cache derivable de expense_payments. */
    @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    monto_pagado: number;

    /** Cuando vence. Sin esto no hay forma de saber que hay que pagar hoy. */
    @Column({ type: 'date', nullable: true })
    fecha_vencimiento?: Date;

    // --- Aprobacion ---
    // Un gasto por encima del umbral de la empresa nace PENDIENTE y no se puede
    // pagar hasta que alguien lo apruebe. Con umbral 0 nace APROBADO y el
    // circuito no molesta a nadie.

    @Column({ type: 'enum', enum: EstadoAprobacion, default: EstadoAprobacion.APROBADO })
    estado_aprobacion: EstadoAprobacion;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'aprobado_por' })
    aprobado_por?: User;

    @Column({ type: 'timestamptz', nullable: true })
    fecha_aprobacion?: Date;

    @Column({ type: 'varchar', length: 250, nullable: true })
    motivo_rechazo?: string;

    @OneToMany(() => ExpensePayment, (pago) => pago.expense)
    pagos: ExpensePayment[];

    @ManyToOne(() => Proveedor, { eager: true, nullable: true })
    @JoinColumn({ name: 'proveedor_id' })
    proveedor?: Proveedor;

    /**
     * Metodo con el que se espera pagar. El metodo real de cada pago vive en
     * expense_payments: un gasto puede pagarse mitad en efectivo y mitad por
     * transferencia.
     */
    @Column({ type: 'enum', enum: MetodoPagoGasto })
    metodo_pago: MetodoPagoGasto;

    @Column({ type: 'varchar', length: 100, nullable: true })
    numero_comprobante?: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    imagen_comprobante_url?: string;

    @ManyToOne(() => User, { eager: true })
    @JoinColumn({ name: 'empleado_id' })
    empleado: User;

    @Column({ type: 'text', nullable: true })
    notas?: string;

    @Column({ type: 'timestamptz' })
    created_at: Date;

    @ManyToOne(() => Company, { nullable: true })
    @JoinColumn({ name: 'company_id' })
    company: Company;

    @Index()
    @Column({ name: 'company_id', nullable: true })
    companyId: string;
}
