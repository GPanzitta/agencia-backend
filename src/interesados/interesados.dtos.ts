import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

const ORIGENES = ['salon', 'whatsapp', 'telefono', 'sitio', 'mercado_libre', 'referido', 'otro'];
const ETAPAS = ['nuevo', 'contactado', 'visita', 'negociando', 'ganado', 'perdido'];
const TEMPERATURAS = ['frio', 'tibio', 'caliente'];
const CARROCERIAS = ['sedan', 'hatchback', 'suv', 'pickup', 'coupe', 'rural', 'monovolumen', 'utilitario', 'moto', 'otro'];
const FECHA = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
/** En una edición, `null` o `''` borran el dato; al crear, se ignoran. */
const vacio = (_: unknown, v: unknown) => v !== null && v !== '';

export class InteresadoDto {
  @IsOptional() @IsString() @MaxLength(40)
  telefono?: string | null;

  @IsOptional() @ValidateIf(vacio) @IsEmail() @MaxLength(120)
  email?: string | null;

  @IsOptional() @IsIn(ORIGENES)
  origen?: string;

  @IsOptional() @IsIn(TEMPERATURAS)
  temperatura?: string;

  @IsOptional() @ValidateIf(vacio) @IsUUID()
  unidad_id?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  busca?: string | null;

  @IsOptional() @IsString() @MaxLength(60)
  busca_marca?: string | null;

  @IsOptional() @ValidateIf(vacio) @IsIn(CARROCERIAS)
  busca_carroceria?: string | null;

  @IsOptional() @ValidateIf(vacio) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100_000_000_000)
  precio_max?: number | null;

  @IsOptional() @ValidateIf(vacio) @IsIn(['ARS', 'USD'])
  precio_moneda?: 'ARS' | 'USD' | null;

  @IsOptional() @IsString() @MaxLength(200)
  tiene_usado?: string | null;

  @IsOptional() @ValidateIf(vacio) @Matches(FECHA)
  proxima_accion?: string | null;

  @IsOptional() @IsString() @MaxLength(200)
  proxima_nota?: string | null;

  @IsOptional() @ValidateIf(vacio) @IsUUID()
  vendedor_id?: string | null;
}

export class CrearInteresadoDto extends InteresadoDto {
  @IsString() @MinLength(2) @MaxLength(120)
  nombre: string;

  /** La primera nota del seguimiento: qué dijo, qué se le ofreció. */
  @IsOptional() @IsString() @MaxLength(1000)
  nota?: string;
}

export class EditarInteresadoDto extends InteresadoDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  nombre?: string;
}

export class MoverInteresadoDto {
  @IsIn(ETAPAS)
  etapa: 'nuevo' | 'contactado' | 'visita' | 'negociando' | 'ganado' | 'perdido';

  @IsOptional() @IsString() @MaxLength(200)
  motivo?: string;
}

/** Lo que la agencia ofrece por el auto del interesado. */
export class CotizarDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(99999999999)
  valor: number;

  @IsIn(['ARS', 'USD'])
  moneda: 'ARS' | 'USD';

  @IsOptional() @IsString() @MaxLength(300)
  nota?: string;
}

export class NotaDto {
  @IsString() @MinLength(2) @MaxLength(1000)
  texto: string;

  /** Si de la charla sale cuándo volver a hablarle, se agenda en el mismo paso. */
  @IsOptional() @ValidateIf(vacio) @Matches(FECHA)
  proxima_accion?: string | null;

  @IsOptional() @IsString() @MaxLength(200)
  proxima_nota?: string | null;
}

export class ListarInteresadosDto {
  @IsOptional() @IsIn(['activos', 'ganados', 'perdidos'])
  vista?: 'activos' | 'ganados' | 'perdidos';
}

/** Lo que manda el formulario público de la ficha de un auto. */
export class ConsultaWebDto {
  @IsString() @MinLength(2) @MaxLength(120)
  nombre: string;

  @IsString() @MinLength(6) @MaxLength(40)
  telefono: string;

  @IsOptional() @IsString() @MaxLength(1000)
  mensaje?: string;

  @IsOptional() @ValidateIf(vacio) @IsUUID()
  unidad_id?: string | null;

  /** De qué se trata: consultar por un auto, ofrecer el propio para vender o tomar, o un contacto general. */
  @IsOptional() @IsIn(['consulta', 'vender', 'contacto', 'visita', 'aviso'])
  asunto?: 'consulta' | 'vender' | 'contacto' | 'visita' | 'aviso';

  /** «Quiero ir a verlo»: el día que le queda bien. */
  @IsOptional() @ValidateIf(vacio) @Matches(FECHA)
  dia_preferido?: string;

  /** «Avisame cuando entre uno así»: qué busca, en datos que se cruzan contra el stock. */
  @IsOptional() @IsString() @MaxLength(60)
  busca_marca?: string;

  @IsOptional() @ValidateIf(vacio) @IsIn(CARROCERIAS)
  busca_carroceria?: string;

  @IsOptional() @ValidateIf(vacio) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100_000_000_000)
  precio_max?: number;

  @IsOptional() @ValidateIf(vacio) @IsIn(['ARS', 'USD'])
  precio_moneda?: 'ARS' | 'USD';

  /** «Cotizá tu auto»: los mismos datos de `tiene_usado`, sueltos. Llega como texto JSON (el formulario con fotos no manda objetos). */
  @IsOptional() @IsString() @MaxLength(600)
  usado_datos?: string;

  /** «Vendé tu auto»: qué auto tiene (marca, modelo, año, kilómetros), con sus palabras. */
  @IsOptional() @IsString() @MaxLength(200)
  tiene_usado?: string;

  /** Qué quiere hacer con su auto: venderlo, entregarlo en parte de pago o dejarlo en consignación. */
  @IsOptional() @IsIn(['vender', 'entregar', 'consignar'])
  intencion?: 'vender' | 'entregar' | 'consignar';

  /** Trampa para bots: un campo que una persona no ve ni completa. */
  @IsOptional() @IsString() @MaxLength(200)
  sitio_web?: string;
}
