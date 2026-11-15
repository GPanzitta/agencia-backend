import { SetMetadata } from '@nestjs/common';
import { AccionAuditada } from './entities/audit-log.entity';

export const META_AUDIT = 'audit_action';

export interface AuditableOptions {
  accion: AccionAuditada;
  entidad: string;
  /** Campo del body que trae el motivo declarado, si la operación lo pide. */
  campoMotivo?: string;
  /**
   * Param de la ruta que identifica a la entidad auditada. Default `'id'`, que
   * es lo correcto en casi todos los endpoints. Se declara cuando la ruta anida
   * (`PATCH :id/bitacora/:notaId` audita la NOTA, no la orden): sin esto la
   * fila queda apuntando a una entidad que no existe con ese id.
   */
  paramId?: string;
}

/**
 * Marca un endpoint como auditable.
 *
 * Es explícito y no automático a propósito: auditar toda escritura genera
 * ruido que nadie lee, y un log que nadie lee no sirve para investigar nada.
 * Acá entran solo las operaciones donde importa saber quién fue.
 *
 *   @Post(':id/cancel')
 *   @UserProtected(Roles.ADMIN)
 *   @Auditable({ accion: AccionAuditada.VENTA_ANULADA, entidad: 'sale', campoMotivo: 'motivo' })
 */
export const Auditable = (options: AuditableOptions) =>
  SetMetadata(META_AUDIT, options);
