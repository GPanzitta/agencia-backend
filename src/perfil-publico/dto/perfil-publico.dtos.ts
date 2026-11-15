import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsNotEmpty, IsUUID, IsInt, Matches, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateIf,
  ValidateNested, registerDecorator, ValidationOptions,
} from 'class-validator';
import { ACENTOS, ICONOS_SERVICIO, TOPES, esUrlPropia } from '../perfil-publico.util';
import { EQUIPOS_SINTOMA, TIPOS_PIEZA, TOPES_SINTOMAS } from '../sintomas.util';
import { motivoUrlInsegura } from '../../common/url-segura.util';

export const CAMPOS_IMAGEN = ['logo', 'isotipo', 'portada', 'equipo', 'trabajo'] as const;
export type CampoImagen = (typeof CAMPOS_IMAGEN)[number];

/** `@EsUrlPropia()`: la URL tiene que venir del almacén de fotos del sistema. */
function EsUrlPropia(opciones?: ValidationOptions) {
  return (objeto: object, propiedad: string) =>
    registerDecorator({
      name: 'esUrlPropia',
      target: objeto.constructor,
      propertyName: propiedad,
      options: { message: `${propiedad} tiene que ser una imagen subida al sistema`, ...opciones },
      validator: { validate: (valor: unknown) => typeof valor === 'string' && esUrlPropia(valor) },
    });
}

/**
 * `@EsRedSocial()`: o un usuario (`@taller`, `taller`) o una URL `https://`.
 * El portal renderiza esto como `href`, así que ni un `javascript:` ni un
 * `http://` sin cifrar pasan, y una cadena vacía tampoco: si el campo no
 * tiene valor, el ERP no lo manda (se omite, no se envía "").
 */
const RED_SOCIAL_USUARIO = /^@?[A-Za-z0-9._-]{1,50}$/;

/**
 * SEG-46: la URL pasa por `motivoUrlInsegura` (https, con host, sin usuario
 * ni clave: antes `https://taller@otro-host` pasaba y llevaba a `otro-host`),
 * y el error dice qué está mal.
 */
function EsRedSocial(opciones?: ValidationOptions) {
  return (objeto: object, propiedad: string) =>
    registerDecorator({
      name: 'esRedSocial',
      target: objeto.constructor,
      propertyName: propiedad,
      options: {
        message: (args) => {
          const v = args.value;
          const motivo = typeof v === 'string' && /^[a-z][a-z0-9+.-]*:/i.test(v) ? motivoUrlInsegura(v) : null;
          return motivo
            ? `${propiedad}: la dirección ${motivo}`
            : `${propiedad} tiene que ser un usuario (@taller) o una URL https://`;
        },
        ...opciones,
      },
      validator: {
        validate: (valor: unknown) =>
          typeof valor === 'string'
          && valor.length <= 200
          && (RED_SOCIAL_USUARIO.test(valor) || motivoUrlInsegura(valor) === null),
      },
    });
}

class HorarioDto {
  @IsString() @MaxLength(40) dias: string;
  @IsString() @MaxLength(10) desde: string;
  @IsString() @MaxLength(10) hasta: string;
}

class RedesDto {
  @IsOptional() @IsString() @MaxLength(200) @EsRedSocial() instagram?: string;
  @IsOptional() @IsString() @MaxLength(200) @EsRedSocial() facebook?: string;
  @IsOptional() @IsString() @MaxLength(200) @EsRedSocial() tiktok?: string;
  @IsOptional() @IsString() @MaxLength(200) @EsRedSocial() sitio?: string;
}

class ServicioDto {
  @IsString() @MaxLength(TOPES.nombre_servicio) nombre: string;
  @IsString() @MaxLength(TOPES.frase) frase: string;
  @IsIn(ICONOS_SERVICIO as readonly string[]) icono: string;
}

class FotoTrabajoDto {
  @IsString() @EsUrlPropia() url: string;
  @IsString() @EsUrlPropia() miniatura: string;
  @IsOptional() @IsString() @MaxLength(TOPES.pie) pie?: string;
}

class CifrasDto {
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) reparaciones?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) opiniones?: number;
  @IsOptional() @IsInt() @Min(0) @Max(3650) garantia_dias?: number;
}

/**
 * Un video de YouTube tal como lo manda el ERP: la URL cruda (el backend
 * extrae el id) y, si el taller lo cargó, el título propio.
 */
export class VideoDto {
  @IsString() @MaxLength(TOPES.url_video) url: string;
  @IsOptional() @IsString() @MaxLength(TOPES.titulo_video) titulo_personalizado?: string;
}

/** Parcial: lo que no viene no se toca (S1a §3.3). */
export class RepuestoElegidoDto {
  @IsUUID()
  id: string;

  @IsString() @MaxLength(200)
  nombre: string;
}

export class CausaSintomaDto {
  @IsString() @IsNotEmpty() @MaxLength(TOPES_SINTOMAS.causa)
  causa: string;

  @IsString() @MaxLength(TOPES_SINTOMAS.senal)
  senal: string;

  @IsString() @MaxLength(TOPES_SINTOMAS.tiempo)
  tiempo: string;

  @IsOptional() @IsIn(TIPOS_PIEZA as readonly string[])
  tipo: string | null;

  @IsArray() @ArrayMaxSize(TOPES_SINTOMAS.repuestos) @ValidateNested({ each: true }) @Type(() => RepuestoElegidoDto)
  repuestos: RepuestoElegidoDto[];
}

export class SintomaDto {
  @IsIn(EQUIPOS_SINTOMA as readonly string[])
  equipo: string;

  @IsString() @IsNotEmpty() @MaxLength(TOPES_SINTOMAS.sintoma)
  sintoma: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(TOPES_SINTOMAS.causas) @ValidateNested({ each: true }) @Type(() => CausaSintomaDto)
  causas: CausaSintomaDto[];
}

export class ActualizarPerfilPublicoDto {
  // null significa "borrar" y se acepta a propósito en estos 6 campos (anulables)
  @IsOptional() @IsString() @MaxLength(TOPES.eslogan)
  eslogan?: string | null;

  // null significa "borrar" y se acepta a propósito
  @IsOptional() @IsString() @MaxLength(TOPES.quienes_somos)
  quienes_somos?: string | null;

  // null significa "borrar" y se acepta a propósito
  @IsOptional() @IsString() @MaxLength(TOPES.zona)
  zona?: string | null;

  @ValidateIf((_, v) => v !== undefined) @IsIn(ACENTOS as readonly string[])
  color_acento?: string;

  // null significa "borrar" y se acepta a propósito
  @IsOptional() @EsUrlPropia()
  logo_url?: string | null;

  // null significa "borrar" y se acepta a propósito
  @IsOptional() @EsUrlPropia()
  isotipo_url?: string | null;

  // null significa "borrar" y se acepta a propósito
  @IsOptional() @EsUrlPropia()
  portada_url?: string | null;

  // null significa "borrar" y se acepta a propósito
  @IsOptional() @EsUrlPropia()
  foto_equipo_url?: string | null;

  @ValidateIf((_, v) => v !== undefined) @IsArray() @ArrayMaxSize(TOPES.horarios) @ValidateNested({ each: true }) @Type(() => HorarioDto)
  horarios?: HorarioDto[];

  @ValidateIf((_, v) => v !== undefined) @IsObject() @ValidateNested() @Type(() => RedesDto)
  redes?: RedesDto;

  @ValidateIf((_, v) => v !== undefined) @IsArray() @ArrayMaxSize(TOPES.marcas) @IsString({ each: true }) @MaxLength(TOPES.marca, { each: true })
  marcas?: string[];

  @ValidateIf((_, v) => v !== undefined) @IsArray() @ArrayMaxSize(TOPES.servicios) @ValidateNested({ each: true }) @Type(() => ServicioDto)
  servicios?: ServicioDto[];

  @ValidateIf((_, v) => v !== undefined) @IsArray() @ArrayMaxSize(TOPES.fotos_trabajos) @ValidateNested({ each: true }) @Type(() => FotoTrabajoDto)
  fotos_trabajos?: FotoTrabajoDto[];

  @ValidateIf((_, v) => v !== undefined) @IsObject() @ValidateNested() @Type(() => CifrasDto)
  cifras?: CifrasDto;

  /**
   * La lista COMPLETA de videos, en orden. El backend resuelve título y canal
   * por `oembed`; lo que ya estaba guardado no se vuelve a consultar.
   */
  @ValidateIf((_, v) => v !== undefined) @IsArray() @ArrayMaxSize(TOPES.videos) @ValidateNested({ each: true }) @Type(() => VideoDto)
  videos?: VideoDto[];

  // null significa "borrar" y se acepta a propósito: apaga la sección de opiniones.
  // SEG-46: un place_id de Google son letras, dígitos, guion y guion bajo.
  @IsOptional() @IsString() @MaxLength(TOPES.place_id)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'El ID del lugar de Google sólo lleva letras, números, guiones y guiones bajos.' })
  google_place_id?: string | null;

  /** La lista COMPLETA de síntomas: el ERP manda todo junto, como los servicios. */
  @ValidateIf((_, v) => v !== undefined) @IsArray() @ArrayMaxSize(TOPES_SINTOMAS.sintomas) @ValidateNested({ each: true }) @Type(() => SintomaDto)
  sintomas?: SintomaDto[];

  /** «Te lo instalamos» (spec 2026-11-07 §8.3). Sin null: la columna es NOT NULL. */
  @ValidateIf((_, v) => v !== undefined) @IsBoolean()
  instalacion_activa?: boolean;

  // null significa "borrar" y se acepta a propósito: las condiciones son opcionales.
  @IsOptional() @IsString() @MaxLength(TOPES.instalacion_texto)
  instalacion_texto?: string | null;

  /** «Vende repuestos»: apagado, el sitio no ofrece buscar piezas. Sin null: la columna es NOT NULL. */
  @ValidateIf((_, v) => v !== undefined) @IsBoolean()
  vende_repuestos?: boolean;
}

