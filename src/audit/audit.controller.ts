import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { ConsultarAuditoriaDto } from './dto/consultar-auditoria.dto';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { Roles } from '../enums/roles.enum';

/**
 * Consulta del log de auditoría. Solo dueño/admin: es información sobre
 * el desempeño y las acciones del personal.
 *
 * No hay endpoints de escritura ni de borrado a propósito — el log lo alimenta
 * el interceptor y nadie lo edita, que es lo que le da valor como evidencia.
 */
@Controller('auditoria')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @UserProtected(Roles.ADMIN)
  consultar(@Query() filtros: ConsultarAuditoriaDto) {
    return this.auditService.consultar(filtros);
  }

  @Get('resumen')
  @UserProtected(Roles.ADMIN)
  resumen(@Query('dias') dias?: string) {
    const n = Number(dias);
    return this.auditService.resumen(Number.isFinite(n) && n > 0 && n <= 365 ? n : 30);
  }
}
