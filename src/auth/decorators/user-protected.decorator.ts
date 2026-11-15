import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../enums/roles.enum';
import { UserRoleGuard } from '../guards/user-role.guard';

export const META_ROLES = 'roles';

export function UserProtected(...roles: Roles[]) {
  return applyDecorators(
    SetMetadata(META_ROLES, roles),
    UseGuards(AuthGuard('jwt'), UserRoleGuard),
  );
}
