import { CanActivate, ExecutionContext, ForbiddenException, Injectable, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { META_ROLES } from '../decorators/user-protected.decorator';
import { User } from '../entities/user.entity';
import { Roles } from '../../enums/roles.enum';

@Injectable()
export class UserRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Mira el handler y, si no tiene, la clase. Falla CERRADO: este guard sólo
    // corre por @UserProtected, así que sin lista de roles (o con la lista
    // vacía, `@UserProtected()`) es un error de programación, y antes dejaba
    // pasar a cualquier empleado logueado.
    const validRoles: string[] | undefined = this.reflector.getAllAndOverride(
      META_ROLES,
      [context.getHandler(), context.getClass?.()].filter(Boolean) as Function[],
    );

    if (!validRoles || validRoles.length === 0) {
      throw new ForbiddenException('Tu usuario no tiene un rol válido para esta acción.');
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user as User;

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.role) {
      throw new ForbiddenException(
        'Tu usuario no tiene un rol válido para esta acción.'
      );
    }

    // El superadmin de la plataforma pasa siempre; así los decorators listan
    // solo los puestos del taller sin repetirlo en cada endpoint.
    if (user.role.nombre === Roles.SUPERADMIN) {
      return true;
    }

    if (validRoles.includes(user.role.nombre)) {
      return true;
    }
    
    throw new ForbiddenException(
      'Tu usuario no tiene un rol válido para esta acción.'
    );
  }
}
