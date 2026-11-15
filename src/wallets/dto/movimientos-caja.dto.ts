import { IsNotEmpty, IsNumber, IsPositive, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/** Transferencia de plata entre dos cajas. */
export class TransferenciaDto {
  @IsUUID()
  @IsNotEmpty()
  origen_id: string;

  @IsUUID()
  @IsNotEmpty()
  destino_id: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monto: number;

  /** Obligatorio: plata que se mueve sin motivo es plata que no se puede auditar. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  motivo: string;
}

/** Ajuste del saldo de una caja a lo contado físicamente. */
export class AjusteCajaDto {
  /** Lo que hay de verdad en la caja. Cero es válido: está vacía. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  saldo_real: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  motivo: string;
}
