import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsIn } from 'class-validator';
import { CrearRecurrenteDto } from './crear-recurrente.dto';

/**
 * El PATCH de un gasto fijo (#16). Antes era `Partial<CrearRecurrenteDto>`, un
 * tipo que no existe en runtime: el pipe no validaba nada y se podía mandar
 * `activo`, `proxima_generacion` o `generados` y pisar el reloj de la plantilla.
 * Ahora sólo entra lo del formulario. La empresa no se cambia: la plantilla es
 * del taller que la creó.
 */
export class ActualizarRecurrenteDto extends PartialType(
  OmitType(CrearRecurrenteDto, ['companyId'] as const),
) {}

/** Los dos modos de «Reactivar»: ver `RecurringExpensesService.reactivar`. */
export const MODOS_REACTIVAR = ['pendiente', 'hoy'] as const;
export type DesdeReactivar = (typeof MODOS_REACTIVAR)[number];

export class ReactivarRecurrenteDto {
  @IsIn(MODOS_REACTIVAR)
  desde: DesdeReactivar;
}
