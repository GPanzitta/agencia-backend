import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Matches, Max,
  MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { AgendaConfigDto } from './agenda-config.dto';
import type { SlaConfig } from '../config-heredada.util';

/**
 * SEG-53: los plazos prometidos por etapa, en horas. Antes era `@IsObject` y
 * se guardaba cualquier forma (claves inventadas, textos, negativos), que
 * después Analítica usaba para medir. Los tres, de 1 a 720 (30 días), igual
 * que los topes del formulario del ERP.
 */
export class SlaConfigDto implements SlaConfig {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(720)
  diagnostico_horas: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(720)
  cotizacion_horas: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(720)
  reparacion_horas: number;
}

/** Lo que el pie de los documentos sabe imprimir como condición frente al IVA. */
export const CONDICIONES_IVA = ['responsable_inscripto', 'monotributo', 'exento'] as const;
/** Cuándo se emite la factura: al cobrar, o al cobrar la seña y al cobrar el saldo. */
export const MOMENTOS_FACTURA = ['al_cobrar', 'al_senar'] as const;

/** Un plan de cuotas de la tienda (spec 2026-10-07 tienda §3.2). Que no se repita lo controla el servicio. */
export class PlanCuotasDto {
  @IsInt()
  @Min(2)
  @Max(24)
  cuotas: number;

  @IsBoolean()
  sin_interes: boolean;
}

export class ActualizarEmpresaDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(250)
  direccion?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  telefono?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  cuit?: string;

  // ─── Datos legales de los documentos (opción B, 13/10/2026) ────────────
  // Los de texto aceptan `null` para borrarlos (el papel vuelve al respaldo).

  @ValidateIf((o) => o.razon_social !== null)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  razon_social?: string | null;

  @ValidateIf((o) => o.condicion_iva !== null)
  @IsIn(CONDICIONES_IVA)
  @IsOptional()
  condicion_iva?: (typeof CONDICIONES_IVA)[number] | null;

  @ValidateIf((o) => o.iibb !== null)
  @IsString()
  @MaxLength(30)
  @IsOptional()
  iibb?: string | null;

  /** `aaaa-mm-dd`, una fecha que exista. */
  @ValidateIf((o) => o.inicio_actividades !== null)
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'El inicio de actividades va como aaaa-mm-dd.' })
  @IsOptional()
  inicio_actividades?: string | null;

  @ValidateIf((o) => o.email_contacto !== null)
  @IsEmail()
  @MaxLength(120)
  @IsOptional()
  email_contacto?: string | null;

  @ValidateIf((o) => o.horario_atencion !== null)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  horario_atencion?: string | null;

  /** 0 = la revisión no tiene cargo. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  @IsOptional()
  costo_revision?: number;

  @IsBoolean()
  @IsOptional()
  revision_se_descuenta?: boolean;

  /** Días hábiles para mandar el presupuesto. */
  @IsInt()
  @Min(1)
  @Max(15)
  @IsOptional()
  plazo_presupuesto_dias?: number;

  /** Días hábiles para reparar (Ley 5.672 CABA art. 3: más de 30 corridos sólo por escrito). */
  @IsInt()
  @Min(1)
  @Max(30)
  @IsOptional()
  plazo_reparacion_dias?: number;

  /** 0 = sin cargo por guarda; sólo corre desde la intimación (art. 2590 CCyC). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  @IsOptional()
  canon_guarda_diario?: number;

  /** Días hábiles para revisar un equipo que vuelve en garantía. */
  @IsInt()
  @Min(1)
  @Max(30)
  @IsOptional()
  revision_garantia_dias?: number;

  @IsIn(MOMENTOS_FACTURA)
  @IsOptional()
  factura_momento?: (typeof MOMENTOS_FACTURA)[number];

  @ValidateIf((o) => o.traslado_garantia !== null)
  @IsString()
  @MaxLength(600)
  @IsOptional()
  traslado_garantia?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  // null o '' lo quitan; sin el campo no se toca (CLI-02).
  mp_access_token?: string | null;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  sena_porcentaje?: number;

  @IsUUID()
  @IsOptional()
  mp_wallet_id?: string;

  /**
   * D2 — Dónde entran las transferencias que el chofer cobra en la puerta.
   * Como `mp_wallet_id`: `null` pasa el `@IsOptional` y la borra.
   */
  @IsUUID()
  @IsOptional()
  transferencia_wallet_id?: string;

  @IsInt()
  @Min(0)
  @Max(3650)
  @IsOptional()
  garantia_dias?: number;

  /** Días en listo/rechazada sin retirar para considerar abandono (T4). */
  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  dias_abandono?: number;

  /** Exigir compra hecha y pagada para dar un repuesto por recibido. */
  @IsBoolean()
  @IsOptional()
  exigir_oc_paga_repuestos?: boolean;

  /**
   * T6 — Días hábiles, grilla de turnos del taller y bloques de los turnos a
   * domicilio (13/10/2026: bloques de 2 h en vez de franjas mañana/tarde).
   */
  @ValidateNested()
  @Type(() => AgendaConfigDto)
  @IsOptional()
  agenda_config?: AgendaConfigDto;

  /** Lo que se le cobra al cliente por ir hasta su casa. SEG-53: con tope, como la revisión. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  @IsOptional()
  costo_visita_domicilio?: number;

  /** T7 — Plazos prometidos por etapa, en horas. */
  @ValidateNested()
  @Type(() => SlaConfigDto)
  @IsOptional()
  sla_config?: SlaConfigDto;

  /** Cuántas órdenes activas aguanta un técnico antes de saturarse. */
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  tope_ordenes_tecnico?: number;

  /**
   * C5 — Margen sobre el costo para el precio sugerido del repuesto. La
   * columna existe desde C1 y el ERP ya la muestra en la ficha; lo único que
   * impedía guardarla era el `whitelist` global, que descartaba la clave y
   * hacía que el PATCH devolviera 200 sin haber guardado nada (conflicto 5).
   */
  @IsInt()
  @Min(0)
  @Max(500)
  @IsOptional()
  margen_repuestos_porcentaje?: number;

  /** C5 — Umbral de la alerta "este renglón vino más caro" al recibir una OC. */
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  alerta_suba_costo_porcentaje?: number;

  /**
   * T11b — La tienda ofrece envío a domicilio. La columna existe desde T4 y
   * `GET /tienda/config` ya la muestra; mismo hueco que C5: el `whitelist`
   * global la descartaba y el PATCH devolvía 200 sin haber guardado nada.
   */
  @IsBoolean()
  @IsOptional()
  envio_habilitado?: boolean;

  /** T11b — Monto fijo del envío de la tienda. SEG-53: con tope. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  @IsOptional()
  costo_envio_tienda?: number;

  /**
   * T11b — Cuánto dura una reserva sin pagar antes de liberar el stock.
   * Mínimo 1: en 0 toda venta nacería vencida (riesgo señalado en la
   * revisión de T6).
   */
  @IsInt()
  @Min(1)
  // SEG-53: una reserva de años acaparaba el stock para siempre.
  @Max(720)
  @IsOptional()
  reserva_horas?: number;

  /** Spec 2026-10-02 §3.6 — tope de descuento del mostrador, en %. Admin y superadmin no tienen tope. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @IsOptional()
  descuento_maximo_mostrador?: number;

  // ─── Tienda: capa comercial (spec 2026-10-07 tienda §3.2) ─────────────

  @IsIn([21, 10.5])
  @IsOptional()
  alicuota_iva_defecto?: number;

  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => PlanCuotasDto)
  @IsOptional()
  cuotas_tienda?: PlanCuotasDto[];

  /** Habilitarla exige CBU o alias, titular y caja de transferencias: lo valida el servicio (TRANSFERENCIA_INCOMPLETA). */
  @IsBoolean()
  @IsOptional()
  transferencia_tienda_habilitada?: boolean;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  @IsOptional()
  transferencia_descuento_porcentaje?: number;

  @ValidateIf((o) => o.transferencia_cbu !== null)
  @Matches(/^\d{22}$/, { message: 'El CBU tiene 22 números.' })
  @IsOptional()
  transferencia_cbu?: string | null;

  @ValidateIf((o) => o.transferencia_alias !== null)
  @Matches(/^[A-Za-z0-9.-]{6,20}$/, { message: 'El alias tiene de 6 a 20 letras, números, puntos o guiones.' })
  @IsOptional()
  transferencia_alias?: string | null;

  @ValidateIf((o) => o.transferencia_titular !== null)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  transferencia_titular?: string | null;

  @ValidateIf((o) => o.envio_gratis_desde !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  @IsOptional()
  envio_gratis_desde?: number | null;
}

export class MarcarPrimerosPasosDto {
  @IsOptional()
  @IsBoolean()
  plantillas_vistas?: boolean;

  @IsOptional()
  @IsBoolean()
  cerrado?: boolean;
}
