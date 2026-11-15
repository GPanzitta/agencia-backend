import { IsDate, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { FechaLocal } from '../../common/fecha-local.transform';
import { Frecuencia } from '../entities/recurring-expense.entity';
import { CategoriaGasto, MetodoPagoGasto } from '../../expenses/entities/expense.enums';

export class CrearRecurrenteDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    descripcion: string;

    @IsEnum(CategoriaGasto)
    categoria: CategoriaGasto;

    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    monto: number;

    @IsEnum(MetodoPagoGasto)
    metodo_pago: MetodoPagoGasto;

    @IsEnum(Frecuencia)
    frecuencia: Frecuencia;

    @IsInt()
    @Min(1)
    @Max(31)
    dia_vencimiento: number;

    // @FechaLocal y no @Type(() => Date): 'YYYY-MM-DD' parseado como UTC es el
    // día anterior en Argentina, y la columna `date` guardaba ese día.
    @IsDate()
    @FechaLocal()
    fecha_inicio: Date;

    // null = sin «Hasta»: el formulario lo manda así para poder borrarlo (#16).
    // @IsOptional deja pasar el null; '' no pasa.
    @IsDate()
    @FechaLocal()
    @IsOptional()
    fecha_fin?: Date | null;

    // null = quitar el proveedor. Ausente = no tocarlo.
    @IsUUID()
    @IsOptional()
    proveedor_id?: string | null;

    @IsUUID()
    @IsOptional()
    companyId?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notas?: string | null;
}
