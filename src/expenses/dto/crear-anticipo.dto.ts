import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';

export class CrearAnticipoDto {
  @IsUUID()
  @IsNotEmpty()
  proveedor_id: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monto: number;

  @IsUUID()
  @IsNotEmpty()
  wallet_id: string;

  @IsString()
  @IsOptional()
  @MaxLength(250)
  notas?: string;
}
