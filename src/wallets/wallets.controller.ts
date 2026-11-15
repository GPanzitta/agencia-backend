import { limiteSeguro } from '../common/limite.util';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { AjusteCajaDto, TransferenciaDto } from './dto/movimientos-caja.dto';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/entities/user.entity';
import { Roles } from '../enums/roles.enum';
import { Auditable } from '../audit/auditable.decorator';
import { AccionAuditada } from '../audit/entities/audit-log.entity';

@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly ledger: WalletLedgerService,
  ) {}

  @Post()
  @UserProtected(Roles.ADMIN)
  create(@Body() createWalletDto: CreateWalletDto) {
    return this.walletsService.create(createWalletDto);
  }

  // Leer la lista no es tocar la caja: es elegir en qué billetera entra o sale
  // lo que ya se cobró. El pañol elige de dónde sale el pago contra entrega
  // (spec C §2.5) y el técnico cobra en la entrega de la OS, en la de la
  // tienda y en la ruta. Mover plata sigue siendo del admin (transferencia,
  // ajuste, alta y baja, acá abajo).
  @Get()
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR, Roles.PANOL, Roles.TECNICO)
  findAll() {
    return this.walletsService.findAll();
  }

  @Get('active')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR, Roles.PANOL, Roles.TECNICO)
  findActive() {
    return this.walletsService.findActive();
  }

  /**
   * POST /wallets/transferencia — mueve plata de una caja a otra.
   * Dos asientos atómicos; el egreso pasa por el chequeo de fondos.
   * Declarado antes de las rutas ':id' para que Nest no lo tome como uuid.
   */
  @Post('transferencia')
  @UserProtected(Roles.ADMIN)
  @Auditable({ accion: AccionAuditada.MOVIMIENTO_CAJA, entidad: 'wallet', campoMotivo: 'motivo' })
  transferir(@Body() dto: TransferenciaDto, @GetUser() user: User) {
    return this.ledger.transferir(dto.origen_id, dto.destino_id, dto.monto, dto.motivo, user.id);
  }

  @Get(':id')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  findOne(@Param('id') id: string) {
    return this.walletsService.findOne(id);
  }

  /**
   * POST /wallets/:id/ajuste — declara el saldo contado físicamente y el
   * sistema escribe un asiento por la diferencia, con motivo obligatorio.
   * Restringido y auditado: es la forma legítima de "tocar" un saldo.
   */
  @Post(':id/ajuste')
  @UserProtected(Roles.ADMIN)
  @Auditable({ accion: AccionAuditada.MOVIMIENTO_CAJA, entidad: 'wallet', campoMotivo: 'motivo' })
  ajustar(@Param('id') id: string, @Body() dto: AjusteCajaDto, @GetUser() user: User) {
    return this.ledger.ajustar(id, dto.saldo_real, dto.motivo, user.id);
  }

  /**
   * GET /wallets/:id/movimientos — el libro de la billetera: cada entrada y
   * salida con su saldo posterior. Es lo que responde "¿por qué la caja tiene
   * este número?" sin tener que confiar en el caché.
   *
   * Solo del dueño. El libro no es el saldo: cada asiento trae el concepto con
   * el número de la venta, el gasto que se pagó y el motivo del ajuste, o sea
   * la actividad del negocio renglón por renglón. Al mostrador se le abre la
   * lista de cajas con su monto (`GET /wallets`), que es lo que necesita para
   * elegir de dónde sale o entra la plata, y nada más. Estaba abierto a
   * mostrador sin que ninguna pantalla suya lo llamara: las dos que lo usan
   * —el dashboard de gastos y Configuración › Billeteras— ya son de admin.
   */
  @Get(':id/movimientos')
  @UserProtected(Roles.ADMIN)
  movimientos(@Param('id') id: string, @Query('limite') limite?: string) {
    return this.ledger.movimientos(id, limiteSeguro(limite, 50));
  }

  /**
   * PATCH /wallets/:id/recalcular — repara el caché de saldo desde el ledger
   * y devuelve la diferencia que había. Si no da cero, algo escribió saldo
   * sin pasar por el libro.
   */
  @Patch(':id/recalcular')
  @UserProtected(Roles.ADMIN)
  recalcular(@Param('id') id: string) {
    return this.ledger.recalcular(id);
  }

  @Patch(':id')
  @UserProtected(Roles.ADMIN)
  update(@Param('id') id: string, @Body() updateWalletDto: UpdateWalletDto) {
    return this.walletsService.update(id, updateWalletDto);
  }

  @Delete(':id')
  @UserProtected(Roles.ADMIN)
  remove(@Param('id') id: string) {
    return this.walletsService.remove(id);
  }
}
