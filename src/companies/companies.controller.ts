import { Body, Controller, Get, Patch } from '@nestjs/common';

import { CompaniesService } from './companies.service';
import { ActualizarEmpresaDto, MarcarPrimerosPasosDto } from './dto/actualizar-empresa.dto';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { User } from '../auth/entities/user.entity';
import { Roles } from '../enums/roles.enum';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly service: CompaniesService) {}

  /** Membrete para los documentos: lo lee cualquier usuario que imprima. */
  @Get('mi-empresa')
  @Auth()
  miEmpresa(@GetUser() user: User) {
    return this.service.miEmpresa(user);
  }

  @Get('primeros-pasos')
  @UserProtected(Roles.ADMIN)
  primerosPasos(@GetUser() user: User) {
    return this.service.primerosPasos(user);
  }

  @Patch('primeros-pasos')
  @UserProtected(Roles.ADMIN)
  marcarPrimerosPasos(@GetUser() user: User, @Body() dto: MarcarPrimerosPasosDto) {
    return this.service.marcarPrimerosPasos(user, dto);
  }

  @Patch('mi-empresa')
  @UserProtected(Roles.ADMIN)
  actualizar(@GetUser() user: User, @Body() dto: ActualizarEmpresaDto) {
    return this.service.actualizar(user, dto);
  }
}
