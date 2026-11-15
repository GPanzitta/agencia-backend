import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Lo que manda el sitio cuando alguien pide reservar un auto. */
export class PedirReservaDto {
  @IsUUID()
  unidad_id: string;

  @IsString() @MinLength(2) @MaxLength(120)
  nombre: string;

  @IsString() @MinLength(6) @MaxLength(40)
  telefono: string;

  @IsOptional() @IsString() @MaxLength(20)
  documento?: string;

  /** Trampa para bots: una persona nunca lo completa. */
  @IsOptional() @IsString() @MaxLength(200)
  sitio_web?: string;
}

export class ConfirmarReservaDto {
  /** La caja a la que entró la transferencia. */
  @IsOptional() @IsUUID()
  wallet_id?: string;

  /** A cuánto se tomó el dólar, si la seña y el auto están en monedas distintas. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1000000)
  tipo_cambio?: number;
}

export class RechazarReservaDto {
  @IsOptional() @IsString() @MaxLength(300)
  motivo?: string;
}
