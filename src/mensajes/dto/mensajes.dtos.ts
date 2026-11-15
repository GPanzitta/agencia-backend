import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

import { CANALES, CONTEXTOS } from '../plantilla.util';
import type { CanalPlantilla, ContextoPlantilla } from '../plantilla.util';

export class CrearPlantillaDto {
  @IsString() @MinLength(1) @MaxLength(80)
  nombre: string;

  @IsString() @MinLength(1) @MaxLength(2000)
  texto: string;

  @IsIn(CONTEXTOS as unknown as string[])
  contexto: ContextoPlantilla;

  @IsIn(CANALES as unknown as string[])
  canal: CanalPlantilla;

  @IsOptional() @IsString() @MaxLength(150)
  asunto?: string;
}

/** Todo opcional: el editor manda sólo lo que tocó. El contexto y el canal no se cambian. */
export class EditarPlantillaDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  nombre?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(2000)
  texto?: string;

  @IsOptional() @IsString() @MaxLength(150)
  asunto?: string;

  @IsOptional() @IsBoolean()
  activa?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(999)
  orden_visual?: number;
}

/** A quién va el mensaje: un interesado o el comprador de una operación. */
export class DestinoDto {
  @IsIn(CONTEXTOS as unknown as string[])
  contexto: ContextoPlantilla;

  @IsUUID()
  id: string;
}

/** Queda anotado que se abrió WhatsApp con este texto. No lo manda el sistema: lo manda el vendedor. */
export class RegistrarWhatsappDto extends DestinoDto {
  @IsString() @MinLength(1) @MaxLength(4000)
  texto: string;

  @IsOptional() @IsUUID()
  plantilla_id?: string;
}

/** El correo como lo vio y lo corrigió el vendedor: eso es lo que sale. */
export class EnviarCorreoDto extends DestinoDto {
  @IsEmail({}, { message: 'El correo del cliente no es válido.' }) @MaxLength(200)
  para: string;

  @IsString() @MinLength(1) @MaxLength(200)
  asunto: string;

  @IsString() @MinLength(1) @MaxLength(5000)
  cuerpo: string;

  @IsOptional() @IsUUID()
  plantilla_id?: string;
}
