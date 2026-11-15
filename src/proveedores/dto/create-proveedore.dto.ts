import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CondicionIva } from '../entities/proveedore.entity';

export class CreateProveedoreDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  descripcion?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  telefono: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  correo: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  direccion: string;

  // Condición comercial: estos campos ya existían en la entidad y gobiernan
  // vencimientos de gastos y condición de pago de OC, pero el DTO no los
  // aceptaba y el whitelist global rechazaba el request entero.
  @IsString()
  @IsOptional()
  @MaxLength(20)
  cuit?: string;

  @IsEnum(CondicionIva)
  @IsOptional()
  condicion_iva?: CondicionIva;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  dias_pago?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  dias_entrega?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  limite_credito?: number;
}
