import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const MONEDAS = ['ARS', 'USD'];
const CATEGORIAS_REPUESTO = [
  'filtros_fluidos',
  'frenos_suspension',
  'distribucion_motor',
  'neumaticos_llantas',
  'baterias_electricidad',
  'estetica_detailing',
  'chapa_pintura',
  'accesorios_seguridad',
  'otro',
];
const ESTADOS_ORDEN = ['recibida', 'diagnostico', 'en_trabajo', 'control_calidad', 'lista', 'anulada'];
const PRIORIDADES = ['normal', 'alta', 'urgente_entrega'];

export class CrearRepuestoAutoDto {
  @IsString() @MinLength(2) @MaxLength(140)
  nombre: string;

  @IsOptional() @IsString() @MaxLength(60)
  codigo?: string;

  @IsOptional() @IsIn(CATEGORIAS_REPUESTO)
  categoria?: string;

  @IsOptional() @IsString() @MaxLength(60)
  marca?: string;

  @IsOptional() @IsString() @MaxLength(160)
  compatibilidad?: string;

  @IsOptional() @IsString() @MaxLength(60)
  ubicacion?: string;

  @IsOptional() @IsString() @MaxLength(20)
  unidad_medida?: string;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000)
  stock?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000)
  stock_minimo?: number;

  @IsOptional() @IsIn(MONEDAS)
  moneda?: 'ARS' | 'USD';

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000_000)
  costo?: number;

  @IsOptional() @IsString() @MaxLength(120)
  proveedor?: string;
}

export class EditarRepuestoAutoDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(140)
  nombre?: string;

  @IsOptional() @IsString() @MaxLength(60)
  codigo?: string | null;

  @IsOptional() @IsIn(CATEGORIAS_REPUESTO)
  categoria?: string;

  @IsOptional() @IsString() @MaxLength(60)
  marca?: string | null;

  @IsOptional() @IsString() @MaxLength(160)
  compatibilidad?: string | null;

  @IsOptional() @IsString() @MaxLength(60)
  ubicacion?: string | null;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000)
  stock?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000)
  stock_minimo?: number;

  @IsOptional() @IsIn(MONEDAS)
  moneda?: 'ARS' | 'USD';

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000_000)
  costo?: number;

  @IsOptional() @IsString() @MaxLength(120)
  proveedor?: string | null;
}

export class AjustarStockRepuestoDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(-100_000) @Max(100_000)
  delta: number;
}

export class ClienteExternoTallerDto {
  @IsString() @MinLength(2) @MaxLength(120)
  nombre: string;

  @IsOptional() @IsString() @MaxLength(40)
  telefono?: string;

  @IsOptional() @IsString() @MaxLength(20)
  documento?: string;

  @IsOptional() @IsString() @MaxLength(120)
  email?: string;
}

export class VehiculoExternoTallerDto {
  @IsOptional() @IsString() @MaxLength(12)
  dominio?: string;

  @IsString() @MinLength(2) @MaxLength(60)
  marca: string;

  @IsString() @MinLength(1) @MaxLength(80)
  modelo: string;

  @IsOptional() @IsString() @MaxLength(100)
  version?: string;

  @Type(() => Number) @IsInt() @Min(1900) @Max(2100)
  anio: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000)
  km?: number;

  @IsOptional() @IsString() @MaxLength(40)
  color?: string;

  @IsOptional() @IsString() @MaxLength(20)
  combustible?: string;

  @IsOptional() @IsString() @MaxLength(20)
  transmision?: string;
}

export class CrearOrdenAlistajeDto {
  @IsOptional() @IsIn(['stock', 'cliente'])
  tipo_origen?: 'stock' | 'cliente';

  @IsOptional() @IsUUID()
  unidad_id?: string;

  @IsOptional() @ValidateNested() @Type(() => ClienteExternoTallerDto)
  cliente?: ClienteExternoTallerDto;

  @IsOptional() @ValidateNested() @Type(() => VehiculoExternoTallerDto)
  vehiculo?: VehiculoExternoTallerDto;

  @IsString() @MinLength(3) @MaxLength(2000)
  falla_motivo: string;

  @IsOptional() @IsString() @MaxLength(60)
  sector?: string;

  @IsOptional() @IsString() @MaxLength(120)
  responsable?: string;

  @IsOptional() @IsIn(PRIORIDADES)
  prioridad?: 'normal' | 'alta' | 'urgente_entrega';

  @IsOptional() @IsIn(MONEDAS)
  moneda?: 'ARS' | 'USD';
}

export class EditarOrdenAlistajeDto {
  @IsOptional() @IsString() @MaxLength(60)
  sector?: string;

  @IsOptional() @IsString() @MaxLength(120)
  responsable?: string | null;

  @IsOptional() @IsIn(PRIORIDADES)
  prioridad?: 'normal' | 'alta' | 'urgente_entrega';

  @IsOptional() @IsString() @MaxLength(2000)
  falla_motivo?: string;

  @IsOptional() @IsString() @MaxLength(3000)
  diagnostico?: string | null;

  @IsOptional() @IsString() @MaxLength(3000)
  trabajo_realizado?: string | null;

  @IsOptional() @IsIn(MONEDAS)
  moneda?: 'ARS' | 'USD';

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000_000)
  costo_mano_obra?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(10_000_000)
  tipo_cambio?: number | null;

  @IsOptional() @IsArray()
  checklist?: { clave: string; estado: 'pendiente' | 'ok' | 'reparar'; observacion?: string | null }[];
}

export class CambiarEstadoOrdenAlistajeDto {
  @IsIn(ESTADOS_ORDEN)
  estado: 'recibida' | 'diagnostico' | 'en_trabajo' | 'control_calidad' | 'lista' | 'anulada';

  @IsOptional() @IsString() @MaxLength(500)
  nota?: string;

  /** Al pasar a «lista», si se pasa la unidad directamente a «disponible». */
  @IsOptional() @IsBoolean()
  pasar_unidad_a_disponible?: boolean;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(10_000_000)
  tipo_cambio?: number;
}

export class AgregarRepuestoOrdenDto {
  @IsOptional() @IsUUID()
  repuesto_id?: string;

  @IsOptional() @IsString() @MaxLength(140)
  nombre?: string;

  @IsOptional() @IsString() @MaxLength(60)
  codigo?: string;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100_000)
  cantidad: number;

  @IsOptional() @IsIn(MONEDAS)
  moneda?: 'ARS' | 'USD';

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000_000)
  costo_unitario?: number;

  /** Si es true, lo descuenta del pañol de inmediato si hay stock; si no alcanza o es false, queda Pendiente de compra/consumo. */
  @IsOptional() @IsBoolean()
  consumir_ahora?: boolean;
}

export class ItemOrdenCompraTallerDto {
  @IsOptional() @IsUUID()
  repuesto_id?: string;

  @IsOptional() @IsUUID()
  renglon_orden_id?: string;

  @IsOptional() @IsString() @MaxLength(60)
  codigo?: string;

  @IsString() @MinLength(2) @MaxLength(140)
  nombre: string;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100_000)
  cantidad_pedida: number;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000_000)
  costo_unitario: number;
}

export class CrearOrdenCompraTallerDto {
  @IsOptional() @IsUUID()
  orden_id?: string;

  @IsString() @MinLength(2) @MaxLength(140)
  proveedor: string;

  @IsOptional() @IsString() @MaxLength(60)
  numero_remito?: string;

  @IsOptional() @IsIn(MONEDAS)
  moneda?: 'ARS' | 'USD';

  @IsOptional() @IsString() @MaxLength(1000)
  notas?: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => ItemOrdenCompraTallerDto)
  items: ItemOrdenCompraTallerDto[];
}

export class RecibirOrdenCompraTallerDto {
  @IsOptional() @IsString() @MaxLength(60)
  numero_remito?: string;

  /** Si la OC está atada a una Orden de Taller, si al recibir la compra ya se consume y descuenta en esa orden. */
  @IsOptional() @IsBoolean()
  consumir_en_orden?: boolean;
}
