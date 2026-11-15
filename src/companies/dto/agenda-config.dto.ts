import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, Matches, Max, Min, ValidateNested,
} from 'class-validator';

import { DURACION_DOMICILIO_MAX, DURACION_DOMICILIO_MIN } from '../config-heredada.util';

/** 'HH:MM' de 00:00 a 23:59. */
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * La configuración de la agenda que guarda Configuración › Empresa
 * (`companies.agenda_config`). Valida tipos y rangos campo por campo; las
 * reglas que cruzan campos (el «hasta» después del «desde», que entre al
 * menos un turno) las dice `problemaDeAgenda` en el servicio, con palabras.
 */

export class LocalConfigDto {
  @Matches(HORA)
  desde: string;

  @Matches(HORA)
  hasta: string;

  @IsInt() @Min(5) @Max(240)
  duracion_min: number;

  @IsInt() @Min(1) @Max(20)
  cupo_por_hora: number;
}

export class DomicilioConfigDto {
  @Matches(HORA)
  desde: string;

  @Matches(HORA)
  hasta: string;

  /**
   * Entre 1 y 3 horas: la Ley 2.962 de CABA pide que la franja que se le da
   * al cliente para ir a su casa sea de 3 horas como máximo.
   */
  @IsInt() @Min(DURACION_DOMICILIO_MIN) @Max(DURACION_DOMICILIO_MAX)
  duracion_min: number;

  @IsInt() @Min(1) @Max(50)
  cupo_por_bloque: number;
}

/** Legado (antes del 13/10/2026): se acepta para no rebotar un ERP viejo, pero ya no manda. */
export class FranjaConfigDto {
  @IsIn(['manana', 'tarde'])
  codigo: 'manana' | 'tarde';

  @Matches(HORA)
  desde: string;

  @Matches(HORA)
  hasta: string;

  @IsInt() @Min(0) @Max(50)
  cupo: number;
}

export class AgendaConfigDto {
  @IsOptional() @IsArray() @ArrayMaxSize(7)
  @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true })
  dias_habiles?: number[];

  @IsOptional() @ValidateNested() @Type(() => LocalConfigDto)
  local?: LocalConfigDto;

  @IsOptional() @ValidateNested() @Type(() => DomicilioConfigDto)
  domicilio?: DomicilioConfigDto;

  @IsOptional() @IsArray() @ArrayMaxSize(2)
  @ValidateNested({ each: true }) @Type(() => FranjaConfigDto)
  franjas?: FranjaConfigDto[];
}
