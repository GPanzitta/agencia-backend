import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

import { DatosDelAutoDto } from './unidades.dtos';

const MONEDAS = ['ARS', 'USD'];
const FECHA = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const TOPE = 100_000_000_000;

export class PagoDto {
  @IsIn(['efectivo', 'transferencia', 'cheque', 'credito', 'usado', 'otro'])
  medio: 'efectivo' | 'transferencia' | 'cheque' | 'credito' | 'usado' | 'otro';

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(TOPE)
  monto: number;

  @IsIn(MONEDAS)
  moneda: 'ARS' | 'USD';

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000)
  tipo_cambio?: number;

  /** La billetera a la que entra la plata. Sin billetera, el pago queda anotado pero no asentado en caja. */
  @IsOptional() @IsUUID()
  wallet_id?: string;

  @IsOptional() @IsString() @MaxLength(200)
  detalle?: string;

  /** Medio «usado»: el auto que se toma en parte de pago. El monto es el valor que se le reconoce. */
  @IsOptional() @ValidateNested() @Type(() => DatosDelAutoDto)
  toma?: DatosDelAutoDto;
}

export class ReservarDto {
  @IsUUID()
  unidad_id: string;

  @IsString() @MaxLength(120)
  cliente_nombre: string;

  @IsOptional() @IsString() @MaxLength(40)
  cliente_telefono?: string;

  @IsOptional() @IsString() @MaxLength(20)
  cliente_documento?: string;

  /** El precio acordado. Sin dato, el de lista de la unidad. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(TOPE)
  precio?: number;

  @IsOptional() @Matches(FECHA)
  reserva_vence?: string;

  @IsOptional() @IsUUID()
  vendedor_id?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notas?: string;

  /** La seña, si se cobra en el mismo momento. */
  @IsOptional() @ValidateNested() @Type(() => PagoDto)
  sena?: PagoDto;
}

export class CerrarDto {
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(TOPE)
  comision?: number;
}

/** Corregir la comisión de una venta cerrada o marcarla como pagada. */
export class ComisionDto {
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(TOPE)
  comision?: number;

  @IsOptional() @IsBoolean()
  pagada?: boolean;
}

/** El porcentaje de comisión de un vendedor. Vacío = sin porcentaje fijo. */
export class PorcentajeDto {
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(50)
  pct?: number | null;
}

export class PeriodoDto {
  @IsOptional() @Matches(FECHA)
  desde?: string;

  @IsOptional() @Matches(FECHA)
  hasta?: string;
}

export class AnularDto {
  @IsString() @MaxLength(300)
  motivo: string;
}

export class ListarOperacionesDto {
  @IsOptional() @IsIn(['reservas', 'vendidas', 'anuladas', 'todas'])
  vista?: 'reservas' | 'vendidas' | 'anuladas' | 'todas';
}
