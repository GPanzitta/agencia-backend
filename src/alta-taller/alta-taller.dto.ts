import { ArrayMaxSize, IsArray, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { LARGO_MINIMO_CLAVE } from '../auth/clave.util';

export class RegistrarTallerDto {
  @IsString()
  @MinLength(2, { message: 'Poné el nombre del taller.' })
  @MaxLength(100)
  taller: string;

  @IsString()
  @MinLength(2, { message: 'Poné tu nombre.' })
  @MaxLength(100)
  nombre: string;

  @IsEmail({}, { message: 'Ese correo no parece válido.' })
  @MaxLength(200)
  email: string;

  @IsString()
  @MinLength(6, { message: 'Poné un teléfono de contacto.' })
  @MaxLength(40)
  telefono: string;

  @IsString()
  @MinLength(LARGO_MINIMO_CLAVE, { message: `La clave tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.` })
  @MaxLength(72)
  clave: string;

  /** Informativos (spec 2026-10-28 §13.7): los valores por defecto no cambian. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  rubros?: string[];

  /** Campo trampa: el formulario lo esconde; una persona lo deja vacío. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sitio_web?: string;
}

export class ConfirmarCuentaDto {
  @IsString()
  @MaxLength(400)
  token: string;
}

export class ReenviarConfirmacionDto {
  @IsEmail()
  @MaxLength(200)
  email: string;
}

export class PedirRecuperacionDto {
  @IsEmail({}, { message: 'Ese correo no parece válido.' })
  @MaxLength(200)
  email: string;
}

export class CambiarClavePorCorreoDto {
  @IsString()
  @MaxLength(400)
  token: string;

  @IsString()
  @MinLength(LARGO_MINIMO_CLAVE, { message: `La clave tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.` })
  @MaxLength(72)
  clave: string;
}
