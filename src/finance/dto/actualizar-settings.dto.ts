import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * SEG-08: `PATCH /finanzas/settings` hacía `Object.assign` con cualquier cosa:
 * un texto en el umbral daba 500 y se podía escribir cualquier columna.
 * El formulario puede mandar los montos como texto: se convierten.
 */
export class ActualizarSettingsDto {
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999)
  umbral_aprobacion?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999)
  alerta_saldo_minimo?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365)
  dias_aviso_vencimiento?: number;
}

/**
 * Copiar los presupuestos de un mes a otro. El ERP manda `hasta` y el backend
 * leía `hacia`: se aceptan los dos (con `hacia` primero) para no romper a nadie.
 */
export class CopiarPresupuestosDto {
  @IsDateString()
  desde: string;

  @IsOptional() @IsDateString()
  hacia?: string;

  @IsOptional() @IsDateString()
  hasta?: string;
}
