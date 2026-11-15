import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * SEG-08: anular un gasto, un pago o un anticipo, y rechazar un gasto,
 * recibían `motivo` y `destino` sueltos, sin validar. El motivo va al concepto
 * del asiento (varchar 250, con su prefijo) y a las notas.
 */
export class AnulacionDto {
  @IsOptional() @IsString() @MaxLength(200)
  motivo?: string;

  @IsOptional() @IsIn(['turno_actual', 'sin_arqueo'])
  destino?: 'turno_actual' | 'sin_arqueo';
}

export class RechazoGastoDto {
  @IsOptional() @IsString() @MaxLength(250)
  motivo?: string;
}
