import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import type { PlanTaller } from '../../abono/abono.util';

export class PlanTallerDto {
  @IsIn(['gratis', 'pago', 'interno'], { message: 'Ese plan no existe.' })
  plan: PlanTaller;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de vencimiento no es válida.' })
  vence_en?: string;
}

export class ConfigPlataformaDto {
  @IsNumber({}, { message: 'El precio tiene que ser un número.' })
  @Min(1, { message: 'El precio tiene que ser mayor a cero.' })
  precio_mensual: number;

  @IsInt({ message: 'El tope tiene que ser un número entero.' })
  @Min(1, { message: 'El tope tiene que ser de al menos una orden.' })
  tope_ordenes_gratis: number;

  @IsInt({ message: 'Los días de gracia tienen que ser un número entero.' })
  @Min(0, { message: 'Los días de gracia no pueden ser negativos.' })
  @Max(60, { message: 'Los días de gracia no pueden pasar de 60.' })
  dias_gracia: number;
}
