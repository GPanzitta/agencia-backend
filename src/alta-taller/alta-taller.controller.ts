import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AltaTallerService } from './alta-taller.service';
import { RecuperarClaveService } from './recuperar-clave.service';
import { CambiarClavePorCorreoDto, ConfirmarCuentaDto, PedirRecuperacionDto, RegistrarTallerDto, ReenviarConfirmacionDto } from './alta-taller.dto';

/** Público: el alta de un taller nuevo (spec 2026-10-28 §6). */
@Controller('alta-taller')
export class AltaTallerController {
  constructor(private readonly alta: AltaTallerService) {}

  @Post()
  @Throttle({ short: { ttl: 3600000, limit: 5 } })
  registrar(@Body() dto: RegistrarTallerDto) { return this.alta.registrar(dto); }

  @Post('confirmar')
  @HttpCode(200)
  @Throttle({ short: { ttl: 60000, limit: 10 } })
  confirmar(@Body() dto: ConfirmarCuentaDto) { return this.alta.confirmar(dto.token); }

  @Post('reenviar')
  @HttpCode(200)
  @Throttle({ short: { ttl: 3600000, limit: 5 } })
  reenviar(@Body() dto: ReenviarConfirmacionDto) { return this.alta.reenviar(dto.email); }
}

/** Público: «me olvidé la clave». El tope es por IP, como el resto del alta. */
@Controller('auth/recuperar')
export class RecuperarClaveController {
  constructor(private readonly recuperar: RecuperarClaveService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ short: { ttl: 3600000, limit: 5 } })
  pedir(@Body() dto: PedirRecuperacionDto) { return this.recuperar.pedir(dto.email); }

  @Post('cambiar')
  @HttpCode(200)
  @Throttle({ short: { ttl: 60000, limit: 10 } })
  cambiar(@Body() dto: CambiarClavePorCorreoDto) { return this.recuperar.cambiar(dto.token, dto.clave); }
}
