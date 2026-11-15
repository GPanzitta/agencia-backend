import { BadRequestException, Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { Roles } from '../enums/roles.enum';
import { RecurringExpensesService } from './recurring-expenses.service';
import { BudgetsService } from './budgets.service';
import { FinanceSettingsService } from './finance-settings.service';
import { CrearRecurrenteDto } from './dto/crear-recurrente.dto';
import { ActualizarRecurrenteDto, ReactivarRecurrenteDto } from './dto/actualizar-recurrente.dto';
import { CrearPresupuestoDto } from './dto/crear-presupuesto.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/entities/user.entity';
import { ActualizarSettingsDto, CopiarPresupuestosDto } from './dto/actualizar-settings.dto';

@Controller('finanzas')
export class FinanceController {
  constructor(
    private readonly recurrentes: RecurringExpensesService,
    private readonly presupuestos: BudgetsService,
    private readonly settings: FinanceSettingsService,
  ) {}

  // ─── Gastos recurrentes ─────────────────────────────────────────────────

  @Post('recurrentes')
  @UserProtected(Roles.ADMIN)
  crearRecurrente(@Body() dto: CrearRecurrenteDto) {
    return this.recurrentes.crear(dto);
  }

  @Get('recurrentes')
  @UserProtected(Roles.ADMIN)
  // SEG-07: la empresa es la de la sesión, nunca un ?companyId= del cliente.
  listarRecurrentes(@GetUser() user: User) {
    return this.recurrentes.listar(user.companyId);
  }

  @Patch('recurrentes/:id')
  @UserProtected(Roles.ADMIN)
  actualizarRecurrente(@Param('id') id: string, @Body() cambios: ActualizarRecurrenteDto) {
    return this.recurrentes.actualizar(id, cambios);
  }

  /**
   * PATCH /finanzas/recurrentes/:id/reactivar — vuelve a poner en marcha una
   * plantilla dada de baja. `desde: 'pendiente'` genera el hueco desde donde
   * quedó; `desde: 'hoy'` lo saltea (#42).
   */
  @Patch('recurrentes/:id/reactivar')
  @UserProtected(Roles.ADMIN)
  reactivarRecurrente(@Param('id') id: string, @Body() dto: ReactivarRecurrenteDto) {
    return this.recurrentes.reactivar(id, dto.desde);
  }

  @Delete('recurrentes/:id')
  @UserProtected(Roles.ADMIN)
  desactivarRecurrente(@Param('id') id: string) {
    return this.recurrentes.eliminar(id);
  }

  /**
   * POST /finanzas/recurrentes/generar — dispara la generacion a mano.
   * Corre sola todos los dias a las 6, pero tener el disparo manual permite
   * probarlo sin esperar y recuperar dias si el sistema estuvo caido.
   */
  @Post('recurrentes/generar')
  @UserProtected(Roles.ADMIN)
  generarRecurrentes() {
    return this.recurrentes.generarPendientes();
  }

  // ─── Presupuestos ───────────────────────────────────────────────────────

  @Post('presupuestos')
  @UserProtected(Roles.ADMIN)
  crearPresupuesto(@Body() dto: CrearPresupuestoDto) {
    return this.presupuestos.crear(dto);
  }

  /** GET /finanzas/presupuestos/ejecucion?periodo=2026-08-01 */
  @Get('presupuestos/ejecucion')
  @UserProtected(Roles.ADMIN)
  ejecucion(@GetUser() user: User, @Query('periodo') periodo?: string) {
    return this.presupuestos.ejecucion(periodo, user.companyId);
  }

  @Post('presupuestos/copiar')
  @UserProtected(Roles.ADMIN)
  // SEG-08 y SEG-07: cuerpo validado y la empresa de la sesión, no la del cuerpo.
  copiar(@Body() dto: CopiarPresupuestosDto, @GetUser() user: User) {
    const hacia = dto.hacia ?? dto.hasta;
    if (!hacia) throw new BadRequestException('Falta el período de destino.');
    return this.presupuestos.copiarPeriodo(dto.desde, hacia, user.companyId);
  }

  @Delete('presupuestos/:id')
  @UserProtected(Roles.ADMIN)
  eliminarPresupuesto(@Param('id') id: string) {
    return this.presupuestos.eliminar(id);
  }

  // ─── Parametros ─────────────────────────────────────────────────────────

  @Get('settings')
  @UserProtected(Roles.ADMIN)
  verSettings(@GetUser() user: User) {
    return this.settings.obtener(user.companyId);
  }

  @Patch('settings')
  @UserProtected(Roles.ADMIN)
  // SEG-08: sólo los tres parámetros, con su tipo; la empresa es la de la sesión.
  actualizarSettings(@Body() cambios: ActualizarSettingsDto, @GetUser() user: User) {
    return this.settings.actualizar({ ...cambios, companyId: user.companyId });
  }
}
