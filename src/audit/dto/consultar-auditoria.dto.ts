import { Transform, Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { AccionAuditada } from '../entities/audit-log.entity';
import { finDeDia, inicioDeDia } from '../../common/fechas.util';

/**
 * CLI-11 (auditoría 13/10/2026): con `@Type(() => Date)` un `YYYY-MM-DD` era la
 * medianoche UTC (las 21 h del día anterior en el taller) y «hasta» cortaba
 * ahí: «Desde 13/10 Hasta 13/10» daba 0 registros. Ahora una fecha suelta es
 * el día del taller entero: `desde` su primer instante, `hasta` el último.
 * Un ISO con hora se respeta.
 */
const comoDia = (borde: typeof inicioDeDia) =>
  Transform(({ value }) => (typeof value === 'string' && value ? borde(value) : value));

export class ConsultarAuditoriaDto {
  @IsEnum(AccionAuditada)
  @IsOptional()
  accion?: AccionAuditada;

  @IsUUID()
  @IsOptional()
  usuario_id?: string;

  @IsDate()
  @comoDia(inicioDeDia)
  @IsOptional()
  desde?: Date;

  @IsDate()
  @comoDia(finDeDia)
  @IsOptional()
  hasta?: Date;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  pagina?: number;

  // Con tope: sin él, un `porPagina=1000000` es una forma barata de tirar abajo
  // la base desde un endpoint autenticado.
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  @IsOptional()
  porPagina?: number;
}
