import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Roles } from '../../enums/roles.enum';
import { LARGO_MINIMO_CLAVE } from '../clave.util';

export class RegisterAuthDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  // CLI-17: el correo se guarda en minúsculas y sin espacios: el login no
  // distingue mayúsculas, y dos usuarios que sólo difieren en eso no se crean.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(200)
  email: string;

  @IsString()
  @IsNotEmpty()
  // SEG-54: 10 como mínimo para las altas nuevas (antes 6). Las claves que ya
  // existen siguen andando: el login no mira el largo.
  @MinLength(LARGO_MINIMO_CLAVE, { message: `La clave tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.` })
  @MaxLength(255)
  password: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  telefono?: string;

  /**
   * Rol del empleado que se está dando de alta. Obligatorio: un usuario sin rol
   * pasa igual el `AuthGuard('jwt')` y entra a todos los endpoints que solo
   * piden estar autenticado.
   *
   * La empresa NO se recibe por acá: sale del usuario que crea el alta, para
   * que nadie pueda dar de alta empleados en otro local.
   */
  @IsEnum(Roles, { message: 'Rol inválido' })
  rol: Roles;
}
