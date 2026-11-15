import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';

/**
 * Módulo global de WebSocket Events.
 *
 * Al ser @Global(), EventsService queda disponible para inyectar
 * en cualquier módulo sin necesidad de importar EventsModule.
 *
 * Importa AuthModule para tener acceso a JwtService (validación de tokens).
 */
@Global()
@Module({
  imports: [AuthModule],
  providers: [EventsGateway, EventsService],
  exports: [EventsService],
})
export class EventsModule {}
