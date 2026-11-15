import { MaxLength, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { CategoriaGasto } from '../../expenses/entities/expense.enums';

export class CrearPresupuestoDto {
    @IsEnum(CategoriaGasto)
    categoria: CategoriaGasto;

    /** Cualquier fecha del mes: se normaliza al dia 1. */
    @IsDateString()
    periodo: string;

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    monto_asignado: number;

    /** Porcentaje de consumo a partir del cual avisar. Por defecto 80. */
    @IsInt()
    @Min(1)
    @Max(100)
    @IsOptional()
    umbral_alerta?: number;

    @IsUUID()
    @IsOptional()
    companyId?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notas?: string;
}
