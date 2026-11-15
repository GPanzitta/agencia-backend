import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { User } from '../auth/entities/user.entity';
import { Roles } from '../enums/roles.enum';
import { CrearPlantillaDto, DestinoDto, EditarPlantillaDto, EnviarCorreoDto, RegistrarWhatsappDto } from './dto/mensajes.dtos';
import { MensajesService } from './mensajes.service';

/** Los mensajes que la agencia tiene escritos: los ve quien vende, los cambia el dueño. */
@Controller('mensajes-plantillas')
export class PlantillasController {
  constructor(private readonly service: MensajesService) {}

  @Get()
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  listar(@GetUser() user: User) { return this.service.listar(user); }

  @Post()
  @UserProtected(Roles.ADMIN)
  crear(@Body() dto: CrearPlantillaDto, @GetUser() user: User) { return this.service.crear(dto, user); }

  @Patch(':id')
  @UserProtected(Roles.ADMIN)
  editar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarPlantillaDto, @GetUser() user: User) { return this.service.editar(id, dto, user); }

  @Post(':id/restaurar')
  @UserProtected(Roles.ADMIN)
  restaurar(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) { return this.service.restaurar(id, user); }

  @Delete(':id')
  @UserProtected(Roles.ADMIN)
  borrar(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) { return this.service.borrar(id, user); }
}

/** Escribirle a un interesado o al comprador de una operación. */
@Controller('mensajes')
export class MensajesController {
  constructor(private readonly service: MensajesService) {}

  @Get('para')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  para(@Query() d: DestinoDto, @GetUser() user: User) { return this.service.para(d, user); }

  @Get('historial')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  historial(@Query() d: DestinoDto, @GetUser() user: User) { return this.service.historial(d, user); }

  @Post('whatsapp')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  whatsapp(@Body() dto: RegistrarWhatsappDto, @GetUser() user: User) { return this.service.registrarWhatsapp(dto, user); }

  // Cada llamada manda un correo de verdad: se limita para que un error o un abuso no queme la casilla.
  @Post('correo')
  @Throttle({ short: { ttl: 60000, limit: 10 }, medium: { ttl: 3600000, limit: 120 } })
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  correo(@Body() dto: EnviarCorreoDto, @GetUser() user: User) { return this.service.enviarCorreo(dto, user); }
}
