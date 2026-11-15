import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { User } from '../auth/entities/user.entity';
import { Roles } from '../enums/roles.enum';
import { SitioService } from '../unidades/sitio.service';
import { ConfirmarReservaDto, PedirReservaDto, RechazarReservaDto } from './reservas-web.dtos';
import { ReservasWebService } from './reservas-web.service';

/** La reserva desde el sitio, del lado del cliente: sin login. */
@Controller('catalogo/reservas')
export class ReservasPublicasController {
  constructor(private readonly service: ReservasWebService, private readonly sitio: SitioService) {}

  @Post()
  @Throttle({ short: { ttl: 60000, limit: 4 }, medium: { ttl: 3600000, limit: 12 } })
  async pedir(@Body() dto: PedirReservaDto, @Headers('x-agencia') agencia?: string) {
    return this.service.pedir(dto, await this.sitio.empresaDe(agencia));
  }

  @Get(':token')
  async ver(@Param('token', ParseUUIDPipe) token: string, @Headers('x-agencia') agencia?: string) {
    return this.service.publica(token, await this.sitio.empresaDe(agencia));
  }
}

/** Los pedidos de reserva del sitio, del lado de la agencia. Confirma quien puede reservar y cobrar. */
@Controller('reservas-web')
export class ReservasWebController {
  constructor(private readonly service: ReservasWebService) {}

  @Get()
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  listar(@GetUser() user: User) {
    return this.service.listar(user);
  }

  @Post(':id/confirmar')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  confirmar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmarReservaDto, @GetUser() user: User) {
    return this.service.confirmar(id, dto, user);
  }

  @Post(':id/rechazar')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  rechazar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RechazarReservaDto, @GetUser() user: User) {
    return this.service.rechazar(id, dto, user);
  }
}
