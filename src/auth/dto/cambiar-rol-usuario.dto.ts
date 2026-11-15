import { IsEnum, IsNotEmpty } from 'class-validator';
import { Roles } from '../../enums/roles.enum';

export class CambiarRolUsuarioDto {
  /** Validado contra el enum acá y contra la tabla de roles en el servicio. */
  @IsEnum(Roles, { message: 'Rol inexistente' })
  @IsNotEmpty()
  rol: Roles;
}
