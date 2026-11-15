import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';
import { AuditableOptions, META_AUDIT } from './auditable.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const opciones = this.reflector.get<AuditableOptions>(
      META_AUDIT,
      context.getHandler(),
    );
    if (!opciones) return next.handle();

    const req = context.switchToHttp().getRequest();
    const usuario = req.user;

    return next.handle().pipe(
      // Solo se registra si la operación salió bien: un intento fallido no es
      // un hecho auditable, y anotarlo llenaría el log de ruido.
      tap({
        next: (resultado) => {
          this.auditService
            .registrar({
              accion: opciones.accion,
              entidad: opciones.entidad,
              entidad_id: req.params?.[opciones.paramId ?? 'id'] ?? resultado?.id,
              motivo: opciones.campoMotivo
                ? req.body?.[opciones.campoMotivo]
                : undefined,
              usuario_id: usuario?.id,
              usuario_email: usuario?.email,
              usuario_rol: usuario?.role?.nombre,
              companyId: usuario?.companyId,
              ip: this.extraerIp(req),
              detalle: this.extraerDetalle(req, resultado),
            })
            // El registro de auditoría nunca puede tumbar la operación que
            // audita: si falla, se loguea y la venta sigue su curso.
            .catch((e) =>
              this.logger.error(
                `No se pudo registrar ${opciones.accion}: ${e.message}`,
              ),
            );
        },
      }),
    );
  }

  private extraerIp(req: any): string | undefined {
    const fwd = req.headers?.['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
    return req.ip ?? req.socket?.remoteAddress;
  }

  /**
   * Guarda lo que sirve para entender el hecho, sin arrastrar la respuesta
   * entera (una venta con todos sus ítems no aporta y ocupa).
   */
  private extraerDetalle(req: any, resultado: any): Record<string, any> {
    const detalle: Record<string, any> = {};
    const interesan = [
      'monto',
      'total',
      'importe',
      'estado',
      'estado_anterior',
      'porcentaje',
      'numero_venta',
      'numero_gasto',
      'tipo',
      'destino_id',
      'mesa_destino',
      // El alta y la baja de una plantilla de mensajes: sin estos dos, la fila
      // del log es un uuid huérfano (la plantilla borrada ya no está para ir
      // a mirarla).
      'nombre',
      'contexto',
      // Lista {campo, antes, despues} que devuelven las ediciones de la OS y de la bitácora.
      'cambios',
      // Ajuste de stock: sin esto, el log no dice cuánto se movió ni para qué lado.
      'cantidad',
      'signo',
      // Fusión de repuestos: sin esto, el asiento `repuesto_fusionado` no dice
      // qué repuesto desapareció (F1).
      'perdedor_id',
    ];
    for (const campo of interesan) {
      if (req.body?.[campo] !== undefined) detalle[campo] = req.body[campo];
      else if (resultado?.[campo] !== undefined) detalle[campo] = resultado[campo];
    }
    return Object.keys(detalle).length ? detalle : undefined!;
  }
}
