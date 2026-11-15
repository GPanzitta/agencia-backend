import { Controller, Get, Post, Body, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { limiteSeguro } from '../common/limite.util';
import { AbrirTurnoDto, CerrarTurnoDto } from './dto/turno-caja.dto';
import { CashRegisterService } from './cash-register.service';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/entities/user.entity';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { Roles } from '../enums/roles.enum';
import { TipoMovimientoCaja } from './entities/cash-movement.entity';
import { Auditable } from '../audit/auditable.decorator';
import { AccionAuditada } from '../audit/entities/audit-log.entity';

@Controller('cash-register')
@Auth()
export class CashRegisterController {
  constructor(private readonly cashRegisterService: CashRegisterService) {}

  @Get('active')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  getActiveRegister() {
    return this.cashRegisterService.getActiveRegister();
  }

  /**
   * Abrir lo puede el mostrador porque ya no mueve plata (PLA-04): lo contado
   * queda en el turno y la diferencia con el sistema la ajusta el admin al
   * cerrar, con motivo.
   */
  @Post('open')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  @Auditable({ accion: AccionAuditada.CAJA_ABIERTA, entidad: 'cash_register' })
  openRegister(@GetUser() user: User, @Body() dto: AbrirTurnoDto) {
    return this.cashRegisterService.openRegister(user.id, dto.wallet_amounts);
  }

  @Post(':id/close')
  @UserProtected(Roles.ADMIN)
  @Auditable({ accion: AccionAuditada.CAJA_CERRADA, entidad: 'cash_register', campoMotivo: 'notas' })
  closeRegister(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User, @Body() dto: CerrarTurnoDto) {
    return this.cashRegisterService.closeRegister(id, user.id, dto.wallet_declared_amounts, dto.notas);
  }

  @Post(':id/movement')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  @Auditable({ accion: AccionAuditada.MOVIMIENTO_CAJA, entidad: 'cash_register', campoMotivo: 'motivo' })
  addMovement(
    @Param('id') id: string,
    @GetUser() user: User,
    @Body('tipo') tipo: TipoMovimientoCaja,
    @Body('monto') monto: number,
    @Body('motivo') motivo: string,
    @Body('wallet_id') walletId?: string,
  ) {
    return this.cashRegisterService.addMovement(id, user.id, tipo, monto, motivo, walletId);
  }

  @Get('history')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  getHistory(@Query('limit') limit?: number) {
    return this.cashRegisterService.getHistory(limiteSeguro(limit, 10));
  }
}
