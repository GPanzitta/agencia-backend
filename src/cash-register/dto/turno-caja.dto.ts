import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

/**
 * Cuerpos de abrir y cerrar turno (PLA-04 y PLA-21, auditoría 13/10). Antes
 * eran `@Body('campo')` sueltos, sin validar: un monto "100" llegaba como
 * texto y los totales se concatenaban (`"100" + "50"` = 10050).
 */
export class MontoAperturaDto {
  @IsUUID()
  wallet_id: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;
}

export class AbrirTurnoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MontoAperturaDto)
  wallet_amounts: MontoAperturaDto[];
}

export class MontoDeclaradoDto {
  @IsUUID()
  wallet_id: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  declared_amount: number;
}

export class CerrarTurnoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MontoDeclaradoDto)
  wallet_declared_amounts: MontoDeclaradoDto[];

  /** Obligatorio si el arqueo da diferencia: es el motivo del ajuste. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string;
}
