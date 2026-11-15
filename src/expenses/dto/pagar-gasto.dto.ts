import { IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { FechaLocal } from '../../common/fecha-local.transform';
import { MetodoPagoGasto } from '../entities/expense.entity';

export class PagarGastoDto {
    /** Puede ser menor al total: los pagos parciales son la norma con proveedores. */
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    monto: number;

    /** De que billetera sale la plata. Obligatorio: un pago sin origen no descuenta de ningun lado. */
    @IsUUID()
    @IsNotEmpty()
    wallet_id: string;

    @IsEnum(MetodoPagoGasto)
    @IsNotEmpty()
    metodo_pago: MetodoPagoGasto;

    @IsDate()
    @FechaLocal()
    @IsOptional()
    fecha_pago?: Date;

    /** Numero de transferencia, cheque, comprobante. */
    @IsString()
    @IsOptional()
    @MaxLength(100)
    referencia?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notas?: string;

    @IsUUID()
    @IsOptional()
    empleado_id?: string;
}
