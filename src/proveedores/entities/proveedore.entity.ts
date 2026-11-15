import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

/** Condicion del proveedor frente al IVA. Define que comprobante puede emitir. */
export enum CondicionIva {
    RESPONSABLE_INSCRIPTO = 'responsable_inscripto',
    MONOTRIBUTO = 'monotributo',
    EXENTO = 'exento',
    CONSUMIDOR_FINAL = 'consumidor_final',
    NO_INFORMADA = 'no_informada',
}

@Entity('proveedores')
export class Proveedor {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 100 })
    nombre: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    descripcion?: string;

    @Column({ type: 'varchar', length: 100 })
    telefono: string;

    @Column({ type: 'varchar', length: 100 })
    correo: string;

    @Column({ type: 'varchar', length: 100 })
    direccion: string;

    // --- Datos fiscales y comerciales ---
    // Sin esto el proveedor es una agenda de contactos: no se le puede comprar
    // a cuenta corriente ni armarle un libro IVA compras al contador.

    @Column({ type: 'varchar', length: 13, nullable: true })
    cuit?: string;

    @Column({ type: 'enum', enum: CondicionIva, default: CondicionIva.NO_INFORMADA })
    condicion_iva: CondicionIva;

    /**
     * Dias de plazo acordados. Al cargar un gasto de este proveedor sin
     * vencimiento explicito, se calcula fecha + dias_pago.
     * 0 = contado.
     */
    @Column({ type: 'int', default: 0 })
    dias_pago: number;

    /**
     * Dias que tarda en entregar desde que se le hace el pedido.
     * Es distinto de dias_pago: uno es logistica, el otro financiacion.
     * Sin este dato no se puede saber cuando hay que pedir para no quedarse
     * sin mercaderia.
     */
    @Column({ type: 'int', default: 2 })
    dias_entrega: number;

    /**
     * Tope de deuda acordado. 0 = sin limite.
     * No bloquea la carga: avisa. Un proveedor no deja de entregar porque el
     * sistema diga que no.
     */
    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    limite_credito: number;

    @Column({ type: 'timestamptz' })
    created_at: Date;

    @Column({ type: 'timestamptz', nullable: true })
    updated_at?: Date;

    @Column({ type: 'boolean', default: true })
    activo: boolean;

    @ManyToOne(() => Company, { nullable: true })
    @JoinColumn({ name: 'company_id' })
    company: Company;

    @Index()
    @Column({ name: 'company_id', nullable: true })
    companyId: string;
}
