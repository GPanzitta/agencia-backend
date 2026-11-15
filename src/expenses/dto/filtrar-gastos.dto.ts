import { IsBooleanString, IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { CategoriaGasto, EstadoPagoGasto } from '../entities/expense.entity';

export class FiltrarGastosDto {
    @IsEnum(CategoriaGasto)
    @IsOptional()
    categoria?: CategoriaGasto;

    @IsEnum(EstadoPagoGasto)
    @IsOptional()
    estado_pago?: EstadoPagoGasto;

    @IsUUID()
    @IsOptional()
    proveedor_id?: string;

    @IsDateString()
    @IsOptional()
    desde?: string;

    @IsDateString()
    @IsOptional()
    hasta?: string;

    @IsUUID()
    @IsOptional()
    companyId?: string;

    /** Solo los que ya vencieron y siguen impagos. */
    @IsOptional()
    @Transform(({ value }) => value === true || value === 'true')
    vencidos?: boolean;

    /** Por defecto true: los anulados no aparecen salvo que se pidan. */
    @IsOptional()
    @Transform(({ value }) => value !== false && value !== 'false')
    solo_activos?: boolean;
}
