import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';
import { MetodoPagoGasto } from './../entities/expense.enums';

/**
 * Un pago global a un proveedor, que el sistema imputa solo.
 *
 * Es como se paga en la realidad: "le doy $200.000 a Bebidas SRL", no
 * factura por factura. El backend aplica el monto a los comprobantes
 * pendientes del proveedor en orden de vencimiento (FIFO).
 */
export class PagarProveedorDto {
  @IsUUID()
  @IsNotEmpty()
  proveedor_id: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monto: number;

  @IsUUID()
  @IsNotEmpty()
  wallet_id: string;

  @IsEnum(MetodoPagoGasto)
  @IsNotEmpty()
  metodo_pago: MetodoPagoGasto;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  referencia?: string;

  /** Consumir primero el saldo a favor del proveedor. Por defecto sí. */
  @IsBoolean()
  @IsOptional()
  usar_anticipos?: boolean;

  /** Lo completa el controlador con el usuario autenticado. */
  @IsUUID()
  @IsOptional()
  empleado_id?: string;
}
