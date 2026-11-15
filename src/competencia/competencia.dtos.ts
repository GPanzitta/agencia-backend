import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';

export class AgregarCompetidorDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'Pegá la dirección completa de la página, con https:// adelante.' })
  @MaxLength(500)
  url: string;

  @IsOptional() @IsString() @MaxLength(120)
  nombre?: string;
}

export class DolarDto {
  /** Vacío = la agencia deja de tener un dólar cargado. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(1_000_000)
  dolar?: number | null;
}

export class CompararDto {
  /** A cuántos pesos se toma el dólar, para comparar autos publicados en la otra moneda. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(1_000_000)
  dolar?: number;
}
