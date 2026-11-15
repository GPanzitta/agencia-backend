import { Injectable } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

/**
 * Servicio reutilizable para emitir eventos por WebSocket.
 *
 * Uso desde cualquier servicio:
 *   this.eventsService.emit(companyId, 'order', 'newOrder', { id, numero_venta });
 *
 * El frontend escucha el evento 'events' y filtra por `type` y `message`.
 */
@Injectable()
export class EventsService {
  constructor(private readonly gateway: EventsGateway) {}

  /**
   * Emite un evento a todos los clientes conectados de una empresa.
   *
   * @param companyId  ID del tenant (empresa) al que va dirigido el evento
   * @param type       Categoría del evento (ej: 'order', 'stock', 'table')
   * @param message    Acción específica (ej: 'newOrder', 'statusChanged', 'cancelled')
   * @param data       Datos opcionales para el frontend (ej: { id, numero_venta, estado_cocina })
   */
  emit(companyId: string, type: string, message: string, data?: any): void {
    this.gateway.emitToCompany(companyId, 'events', { type, message, data });
  }

  /**
   * Emite un evento a un cliente de la tienda web, en su propio room.
   *
   * Se usa para el seguimiento del pedido: el cliente ve cambiar el estado
   * del suyo sin enterarse de los pedidos del resto del local.
   *
   * @param customerId ID del cliente web destinatario
   */
  emitToCustomer(customerId: string, type: string, message: string, data?: any): void {
    this.gateway.emitToCustomer(customerId, 'events', { type, message, data });
  }

  /**
   * Emite un evento a TODOS los clientes conectados (sin filtrar por empresa).
   * Usar con cuidado — solo para eventos verdaderamente globales.
   */
  emitGlobal(type: string, message: string, data?: any): void {
    this.gateway.emitToAll('events', { type, message, data });
  }
}
