import { Body, Controller, Get, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import type { User } from '../auth/entities/user.entity';
import { Roles } from '../enums/roles.enum';
import { SuscribirDto } from './abono.dto';
import { AbonoService } from './abono.service';

@Controller('abono')
export class AbonoController {
  constructor(private readonly service: AbonoService) {}

  @Get('estado')
  @Auth()
  estado(@GetUser() user: User) {
    return this.service.estado(user);
  }

  @Post('suscribir')
  @UserProtected(Roles.ADMIN)
  suscribir(@Body() dto: SuscribirDto, @GetUser() user: User) {
    return this.service.suscribir(user, dto.payer_email);
  }

  @Post('volver-a-gratis')
  @UserProtected(Roles.ADMIN)
  volverAGratis(@GetUser() user: User) {
    return this.service.volverAGratis(user);
  }

  @Post('pago-simulado')
  @UserProtected(Roles.ADMIN)
  pagoSimulado(@GetUser() user: User) {
    return this.service.pagoSimulado(user);
  }

  /** Público: lo llama Mercado Pago. Lo protege la firma, y lo que importa se vuelve a leer de MP. */
  @Post('mp/webhook')
  @HttpCode(200)
  webhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-signature') signature: string,
    @Headers('x-request-id') requestId: string,
    @Query('data.id') dataIdQuery: string,
  ) {
    return this.service.webhook(body, {
      signature,
      requestId,
      dataId: dataIdQuery ?? (body?.data as { id?: string } | undefined)?.id,
    });
  }
}
