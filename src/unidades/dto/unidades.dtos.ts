import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const MONEDAS = ['ARS', 'USD'];
const FECHA = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const TOPE = 100_000_000_000;

/** Los datos del auto: se usan al dar de alta, al editar y al tomar un usado en parte de pago. */
export class DatosDelAutoDto {
  @IsOptional() @IsString() @MaxLength(12)
  dominio?: string;

  @IsString() @MaxLength(60)
  marca: string;

  @IsString() @MaxLength(80)
  modelo: string;

  @IsOptional() @IsString() @MaxLength(120)
  version?: string;

  @Type(() => Number) @IsInt() @Min(1900) @Max(2100)
  anio: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(5_000_000)
  km?: number;

  @IsOptional() @IsString() @MaxLength(40)
  color?: string;

  @IsOptional() @IsIn(['nafta', 'diesel', 'gnc', 'hibrido', 'electrico'])
  combustible?: string;

  @IsOptional() @IsIn(['manual', 'automatica'])
  transmision?: string;

  @IsOptional() @IsIn(['sedan', 'hatchback', 'suv', 'pickup', 'coupe', 'rural', 'monovolumen', 'utilitario', 'moto', 'otro'])
  carroceria?: string;

  @IsOptional() @IsString() @MaxLength(40)
  nro_motor?: string;

  @IsOptional() @IsString() @MaxLength(40)
  nro_chasis?: string;
}

export class CrearUnidadDto extends DatosDelAutoDto {
  @IsIn(['compra', 'consignacion'])
  origen: 'compra' | 'consignacion';

  @IsOptional() @IsIn(['usado', '0km'])
  condicion?: 'usado' | '0km';

  @IsOptional() @IsIn(MONEDAS)
  moneda?: 'ARS' | 'USD';

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(TOPE)
  costo_adquisicion?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(TOPE)
  precio_piso?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(TOPE)
  precio_venta?: number;

  @IsOptional() @IsString() @MaxLength(120)
  titular_nombre?: string;

  @IsOptional() @IsString() @MaxLength(40)
  titular_telefono?: string;

  @IsOptional() @IsString() @MaxLength(20)
  titular_documento?: string;

  @IsOptional() @IsString() @MaxLength(80)
  ubicacion?: string;

  @IsOptional() @IsString() @MaxLength(4000)
  notas?: string;
}

/** Todo opcional: se manda sólo lo que cambia. */
export class EditarUnidadDto {
  @IsOptional() @IsString() @MaxLength(12) dominio?: string;
  @IsOptional() @IsString() @MaxLength(60) marca?: string;
  @IsOptional() @IsString() @MaxLength(80) modelo?: string;
  @IsOptional() @IsString() @MaxLength(120) version?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1900) @Max(2100) anio?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(5_000_000) km?: number;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsOptional() @IsIn(['nafta', 'diesel', 'gnc', 'hibrido', 'electrico']) combustible?: string;
  @IsOptional() @IsIn(['manual', 'automatica']) transmision?: string;
  @IsOptional() @IsIn(['sedan', 'hatchback', 'suv', 'pickup', 'coupe', 'rural', 'monovolumen', 'utilitario', 'moto', 'otro']) carroceria?: string;
  @IsOptional() @IsString() @MaxLength(40) nro_motor?: string;
  @IsOptional() @IsString() @MaxLength(40) nro_chasis?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(TOPE) costo_adquisicion?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(TOPE) precio_piso?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(TOPE) precio_venta?: number;
  @IsOptional() @IsString() @MaxLength(120) titular_nombre?: string;
  @IsOptional() @IsString() @MaxLength(40) titular_telefono?: string;
  @IsOptional() @IsString() @MaxLength(20) titular_documento?: string;
  @IsOptional() @IsString() @MaxLength(4000) descripcion?: string;
  @IsOptional() @IsString() @MaxLength(80) ubicacion?: string;
  @IsOptional() @IsString() @MaxLength(4000) notas?: string;
}

export class CambiarEstadoDto {
  @IsIn(['ingreso', 'alistaje', 'disponible', 'devuelta', 'baja'])
  estado: 'ingreso' | 'alistaje' | 'disponible' | 'devuelta' | 'baja';

  @IsOptional() @IsString() @MaxLength(500)
  motivo?: string;
}

/** Lo que la agencia decide mostrar en su sitio. */
export class ConfigurarSitioDto {
  @IsOptional() @IsBoolean()
  muestra_papeles?: boolean;

  /** Si el sitio simula cuotas. Con `false` se apaga y lo demás se ignora. */
  @IsOptional() @IsBoolean()
  financia?: boolean;

  /** Anticipo mínimo, en porcentaje del precio. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(90)
  anticipo_minimo_pct?: number;

  /** Los plazos que se ofrecen, en meses. */
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsInt({ each: true }) @Min(3, { each: true }) @Max(84, { each: true })
  plazos?: number[];

  /** Tasa nominal anual para autos en pesos; vacía = no se financian. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(500)
  tna_ars?: number | null;

  /** Si el sitio toma reservas con seña por transferencia. Con `false` se apaga y lo demás se ignora. */
  @IsOptional() @IsBoolean()
  reserva?: boolean;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100000000000)
  reserva_monto?: number;

  @IsOptional() @IsIn(['ARS', 'USD'])
  reserva_moneda?: 'ARS' | 'USD';

  /** Horas que tiene el cliente para transferir. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(168)
  reserva_horas?: number;

  /** Días que se le guarda el auto con la seña confirmada. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60)
  reserva_dias?: number;

  @IsOptional() @IsString() @MaxLength(60)
  reserva_alias?: string;

  @IsOptional() @IsString() @MaxLength(120)
  reserva_titular?: string;

  /** Tasa nominal anual para autos en dólares; vacía = no se financian. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(500)
  tna_usd?: number | null;
}

/** La publicación tal como la manda el ERP; `normalizarPublicacion` la limpia antes de guardarla. */
export class PublicacionDto {
  @IsArray() @ArrayMaxSize(40) destacados: unknown[];
  @IsArray() @ArrayMaxSize(200) caracteristicas: unknown[];
  @IsArray() @ArrayMaxSize(30) colores: unknown[];
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(TOPE) precio_financiado?: number | null;
  @IsBoolean() mostrar_toma: boolean;
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) relacionadas: string[];
}

export class PublicarDto {
  @IsBoolean()
  publicada: boolean;
}

export class GastoDto {
  @IsString() @MaxLength(200)
  descripcion: string;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(TOPE)
  monto: number;

  @IsIn(MONEDAS)
  moneda: 'ARS' | 'USD';

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000)
  tipo_cambio?: number;
}

export class PapelDto {
  @IsIn(['falta', 'en_tramite', 'ok'])
  estado: 'falta' | 'en_tramite' | 'ok';

  @IsOptional() @Matches(FECHA)
  vence?: string;

  @IsOptional() @IsString() @MaxLength(300)
  nota?: string;
}

export class ListarUnidadesDto {
  @IsOptional() @IsIn(['stock', 'disponibles', 'reservadas', 'vendidas', 'cerradas', 'todas'])
  vista?: 'stock' | 'disponibles' | 'reservadas' | 'vendidas' | 'cerradas' | 'todas';

  @IsOptional() @IsString() @MaxLength(80)
  q?: string;
}
