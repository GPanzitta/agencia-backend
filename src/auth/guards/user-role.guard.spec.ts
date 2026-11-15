import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRoleGuard } from './user-role.guard';
import { META_ROLES } from '../decorators/user-protected.decorator';
import { Roles } from '../../enums/roles.enum';

/** El guard de roles falla cerrado (SEG-31). */
describe('UserRoleGuard', () => {
  const guard = new UserRoleGuard(new Reflector());
  const ctx = (roles: string[] | undefined, rol: string | null) => {
    const handler = () => undefined;
    class Ctrl {}
    if (roles) Reflect.defineMetadata(META_ROLES, roles, handler);
    return {
      getHandler: () => handler,
      getClass: () => Ctrl,
      switchToHttp: () => ({ getRequest: () => ({ user: { role: rol ? { nombre: rol } : null } }) }),
    } as any;
  };

  it('con el rol en la lista, pasa', () => {
    expect(guard.canActivate(ctx([Roles.ADMIN, Roles.PANOL], Roles.PANOL))).toBe(true);
  });

  it('con otro rol, 403', () => {
    expect(() => guard.canActivate(ctx([Roles.ADMIN], Roles.MOSTRADOR))).toThrow(ForbiddenException);
  });

  it('@UserProtected() con la lista vacía ya no deja pasar a cualquiera', () => {
    expect(() => guard.canActivate(ctx([], Roles.CHOFER))).toThrow(ForbiddenException);
  });

  it('sin metadata de roles, 403', () => {
    expect(() => guard.canActivate(ctx(undefined, Roles.CHOFER))).toThrow(ForbiddenException);
  });

  it('el superadmin pasa', () => {
    expect(guard.canActivate(ctx([Roles.ADMIN], Roles.SUPERADMIN))).toBe(true);
  });
});
