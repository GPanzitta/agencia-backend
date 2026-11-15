import { IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { FechaLocal } from '../../common/fecha-local.transform';
import { CategoriaGasto, MetodoPagoGasto, TipoComprobante } from '../entities/expense.entity';

export class CreateExpenseDto {
    @IsDate()
    @FechaLocal()
    @IsNotEmpty()
    fecha: Date;

    @IsEnum(CategoriaGasto)
    @IsNotEmpty()
    categoria: CategoriaGasto;

    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    descripcion: string;

    /**
     * Total del gasto. Opcional solo si se manda el desglose fiscal: en ese caso
     * el servicio calcula monto = neto + iva + percepciones, para que no puedan
     * quedar dos numeros contradiciendose.
     */
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    @IsOptional()
    monto?: number;

    // --- Desglose fiscal (opcional) ---

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @IsOptional()
    neto?: number;

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @IsOptional()
    iva?: number;

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @IsOptional()
    percepciones?: number;

    @IsEnum(TipoComprobante)
    @IsOptional()
    tipo_comprobante?: TipoComprobante;

    @IsString()
    @IsOptional()
    @MaxLength(10)
    punto_venta?: string;

    /** Si no viene, se calcula con los dias de plazo del proveedor. */
    @IsDate()
    @FechaLocal()
    @IsOptional()
    fecha_vencimiento?: Date;

    @IsUUID()
    @IsOptional()
    proveedor_id?: string;

    @IsEnum(MetodoPagoGasto)
    @IsNotEmpty()
    metodo_pago: MetodoPagoGasto;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    numero_comprobante?: string;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    imagen_comprobante_url?: string;

    @IsUUID()
    @IsOptional()
    empleado_id?: string;

    /**
     * Empresa duena del gasto. Lo completa el controlador con la del usuario:
     * antes no se seteaba nunca y los gastos quedaban sin empresa, invisibles
     * para cualquier consulta filtrada por local.
     */
    @IsUUID()
    @IsOptional()
    companyId?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notas?: string;
}
