/**
 * Enums del modulo financiero, en un archivo propio.
 *
 * Viven aca y no en expense.entity.ts para cortar una importacion circular:
 * expense.entity importa ExpensePayment (para la relacion) y expense-payment
 * importa el enum del metodo de pago. Con los enums adentro de la entidad, al
 * evaluarse el decorador @Column el valor todavia era undefined y TypeORM
 * fallaba al arrancar con "defined as enum, but missing enum properties".
 * Las relaciones no sufren el ciclo porque se declaran con arrow functions.
 */

export enum CategoriaGasto {
    INGREDIENTES = 'ingredientes',
    NOMINA = 'nomina',
    ALQUILER = 'alquiler',
    SERVICIOS = 'servicios',
    MARKETING = 'marketing',
    PACKAGING = 'packaging',
    MANTENIMIENTO = 'mantenimiento',
    IMPUESTOS = 'impuestos',
    OTRO = 'otro',
}

export enum MetodoPagoGasto {
    EFECTIVO = 'efectivo',
    TRANSFERENCIA = 'transferencia',
    TARJETA = 'tarjeta',
    DEBITO_AUTOMATICO = 'debito_automatico',
    CHEQUE = 'cheque',
}

export enum EstadoPagoGasto {
    PENDIENTE = 'pendiente',
    PARCIAL = 'parcial',
    PAGADO = 'pagado',
}

/** Comprobante recibido. Define si el IVA es credito fiscal computable. */
export enum TipoComprobante {
    FACTURA_A = 'factura_a',
    FACTURA_B = 'factura_b',
    FACTURA_C = 'factura_c',
    FACTURA_M = 'factura_m',
    NOTA_CREDITO = 'nota_credito',
    NOTA_DEBITO = 'nota_debito',
    TICKET = 'ticket',
    REMITO = 'remito',
    SIN_COMPROBANTE = 'sin_comprobante',
}

export enum EstadoAprobacion {
    APROBADO = 'aprobado',
    PENDIENTE = 'pendiente',
    RECHAZADO = 'rechazado',
}
