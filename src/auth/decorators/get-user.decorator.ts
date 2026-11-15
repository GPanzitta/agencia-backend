import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { User } from '../entities/user.entity';

export const GetUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext): User => {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as User;

    if (!user) {
      throw new InternalServerErrorException('User not found (request)');
    }

    return data ? (user as any)[data] : user;
  },
);
