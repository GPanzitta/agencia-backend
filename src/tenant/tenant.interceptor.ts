import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantContext } from './tenant.context';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const companyId = request.user?.companyId;

    if (companyId) {
      return tenantContext.run(companyId, () => next.handle());
    } else {
      return next.handle();
    }
  }
}
