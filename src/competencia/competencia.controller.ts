import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { User } from '../auth/entities/user.entity';
import { Roles } from '../enums/roles.enum';
import { AgregarCompetidorDto, CompararDto, DolarDto } from './competencia.dtos';
import { CompetenciaService } from './competencia.service';

/** Comparar precios con otros vendedores: el dueño y el vendedor. */
@Controller('competencia')
export class CompetenciaController {
  constructor(private readonly service: CompetenciaService) {}

  @Get()
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  comparacion(@Query() dto: CompararDto, @GetUser() user: User) {
    return this.service.comparacion(dto.dolar ?? null, user);
  }

  @Put('dolar')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  dolar(@Body() dto: DolarDto, @GetUser() user: User) {
    return this.service.guardarDolar(dto.dolar ?? null, user);
  }

  // Cada alta y cada relectura salen a buscar una página ajena: se limitan.
  @Post()
  @Throttle({ short: { ttl: 60000, limit: 6 }, medium: { ttl: 3600000, limit: 40 } })
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  agregar(@Body() dto: AgregarCompetidorDto, @GetUser() user: User) {
    return this.service.agregar(dto, user);
  }

  @Post(':id/leer')
  @Throttle({ short: { ttl: 60000, limit: 6 }, medium: { ttl: 3600000, limit: 40 } })
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  leer(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.service.leer(id, user);
  }

  @Delete(':id')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  quitar(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.service.quitar(id, user);
  }
}
