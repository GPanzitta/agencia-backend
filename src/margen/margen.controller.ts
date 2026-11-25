import { Controller, Get, Query } from '@nestjs/common';

import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { User } from '../auth/entities/user.entity';
import { Roles } from '../enums/roles.enum';
import { PeriodoDto } from '../unidades/dto/operaciones.dtos';
import { MargenService } from './margen.service';

/**
 * La rentabilidad de la agencia: márgenes, descuentos y capital parado. Sólo el
 * dueño, porque son los costos y los números del negocio. Sin fechas, el mes en
 * curso.
 */
@Controller('margen')
export class MargenController {
  constructor(private readonly service: MargenService) {}

  @Get()
  @UserProtected(Roles.ADMIN)
  tablero(@Query() dto: PeriodoDto, @GetUser() user: User) {
    return this.service.tablero(dto, user.companyId);
  }
}
