import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from 'rxjs';
import { User } from '../auth/entities/user.entity';
import { sesionInvalida } from '../auth/sesion.util';
import { SesionesService } from '../auth/sesiones.service';
import { obtenerOrigenesCors } from '../common/cors-origins.util';

// Misma política de CORS que el HTTP normal (ver src/main.ts): dominios de
// desarrollo hardcodeados + los de CORS_ORIGINS. Antes tenía una lista propia
// (heredada de Brumm, con localhost:4200/5173 y un dominio de Vercel que ya
// no existe) que había quedado desalineada de la del REST.
@WebSocketGateway({
  cors: {
    origin: obtenerOrigenesCors(),
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  private revocaciones?: Subscription;

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly sesiones: SesionesService,
  ) {}

  /** CLI-05: baja, cambio de rol o cerrar sesión cortan también los sockets abiertos de ese usuario. */
  afterInit(): void {
    this.revocaciones = this.sesiones.revocadas$.subscribe((userId) => {
      this.server?.in(`user:${userId}`).disconnectSockets(true);
      this.logger.log(`Sockets de user:${userId} cortados (sesión revocada)`);
    });
  }

  onModuleDestroy(): void {
    this.revocaciones?.unsubscribe();
  }

  /**
   * Al conectarse, valida el token JWT y une al cliente al room de su empresa.
   *
   * CLI-05: además de la firma, el usuario tiene que seguir activo, con la
   * misma versión de sesión y con empresa (la regla de `JwtStrategy`). Antes
   * un empleado dado de baja, o un celular después de «Cerrar sesión», seguía
   * recibiendo en vivo los eventos del taller.
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);

      // Los clientes de la tienda web tienen companyId en su token, pero NO
      // pueden entrar al room de la empresa: ahí viajan los eventos de todos
      // los pedidos del local. Cada uno escucha solo el suyo.
      if (payload?.role === 'web_customer') {
        if (!payload.customerId) {
          this.logger.warn(`Web customer ${client.id} without customerId`);
          client.disconnect();
          return;
        }
        client.join(`customer:${payload.customerId}`);
        client.data.customerId = payload.customerId;
        client.data.isWebCustomer = true;
        this.logger.log(
          `Web customer ${client.id} joined room customer:${payload.customerId}`,
        );
        return;
      }

      const user = payload?.id
        ? await this.userRepository.findOne({ where: { id: payload.id }, relations: ['role'] })
        : null;
      const invalida = sesionInvalida(user, payload ?? {});
      if (invalida) {
        this.logger.warn(`Client ${client.id} rechazado: ${invalida.code}`);
        client.disconnect();
        return;
      }

      // La empresa sale de la base, no del token (SEG-07: sin empresa no hay room).
      const companyId = user!.companyId;
      if (!companyId) {
        this.logger.warn(`Client ${client.id} sin empresa: no entra a ningún room`);
        client.disconnect();
        return;
      }
      client.join(`company:${companyId}`);
      client.join(`user:${user!.id}`);
      client.data.companyId = companyId;
      client.data.userId = user!.id;
      this.logger.log(`Client ${client.id} joined room company:${companyId}`);
    } catch (error) {
      this.logger.warn(`Client ${client.id} auth failed: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Permite al cliente unirse manualmente a un room de empresa
   * (fallback si el token no contenía companyId al conectar).
   *
   * Solo puede unirse a la empresa de su propio token: antes, cualquier
   * cliente conectado podía pedir el room de cualquier empresa y escuchar
   * los pedidos de un local ajeno.
   */
  @SubscribeMessage('joinCompany')
  handleJoinCompany(client: Socket, companyId: string): void {
    if (client.data.isWebCustomer) {
      this.logger.warn(
        `Web customer ${client.id} tried to join company:${companyId}`,
      );
      return;
    }
    // SEG-07: sin empresa validada al conectar no se une a ninguna (antes, un
    // token sin companyId podía pedir el room de cualquier empresa).
    if (!client.data.companyId || client.data.companyId !== companyId) {
      this.logger.warn(
        `Client ${client.id} tried to join company:${companyId} but belongs to ${client.data.companyId}`,
      );
      return;
    }
    client.join(`company:${companyId}`);
    client.data.companyId = companyId;
    this.logger.log(`Client ${client.id} joined room company:${companyId}`);
  }

  /**
   * Emite un evento a un cliente de la tienda web (todas sus pestañas).
   */
  emitToCustomer(
    customerId: string,
    event: string,
    payload: { type: string; message: string; data?: any },
  ): void {
    this.server.to(`customer:${customerId}`).emit(event, payload);
    this.logger.debug(
      `Emitted "${event}" to customer:${customerId} → ${payload.type}:${payload.message}`,
    );
  }

  /**
   * Emite un evento a todos los clientes de una empresa específica.
   */
  emitToCompany(
    companyId: string,
    event: string,
    payload: { type: string; message: string; data?: any },
  ): void {
    this.server.to(`company:${companyId}`).emit(event, payload);
    this.logger.debug(
      `Emitted "${event}" to company:${companyId} → ${payload.type}:${payload.message}`,
    );
  }

  /**
   * Emite un evento a TODOS los clientes conectados (broadcast global).
   */
  emitToAll(
    event: string,
    payload: { type: string; message: string; data?: any },
  ): void {
    this.server.emit(event, payload);
  }
}
