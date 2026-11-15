import { Controller, Get } from '@nestjs/common';
import { RolesService } from './roles.service';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { Roles } from '../enums/roles.enum';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /**
   * Sirve para poblar el selector de rol al dar de alta un empleado, así que
   * solo lo necesita quien puede hacer esa alta. Estaba abierto sin token y le
   * mostraba a cualquiera el mapa de roles del sistema.
   */
  @Get()
  @UserProtected(Roles.ADMIN)
  findAll() {
    return this.rolesService.findAll();
  }
}
