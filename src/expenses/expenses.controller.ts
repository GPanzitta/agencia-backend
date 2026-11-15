import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SubidasService } from '../orden-fotos/subidas.service';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/entities/user.entity';
import { AnulacionDto, RechazoGastoDto } from './dto/anulacion.dto';
import { Roles } from '../enums/roles.enum';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { PagarGastoDto } from './dto/pagar-gasto.dto';
import { PagarProveedorDto } from './dto/pagar-proveedor.dto';
import { CrearAnticipoDto } from './dto/crear-anticipo.dto';
import { FiltrarGastosDto } from './dto/filtrar-gastos.dto';
import { Auditable } from '../audit/auditable.decorator';
import { AccionAuditada } from '../audit/entities/audit-log.entity';

/**
 * Los gastos del taller. Todo el controlador es del dueño.
 *
 * El mostrador los cargaba y los consultaba; al perder la pantalla Gastos
 * perdió también el endpoint. Dejarlo abierto por la API con la pantalla
 * cerrada es la peor de las dos mitades: parece sacado y no lo está.
 *
 * Compras no pasa por acá: el gasto de una recepción de OC lo asienta
 * `purchase-orders` adentro, con su propio permiso.
 */
@Controller('expenses')
export class ExpensesController {
  constructor(
    private readonly expensesService: ExpensesService,
    private readonly subidas: SubidasService,
  ) {}

  @Post()
  @UserProtected(Roles.ADMIN)
  create(@Body() createExpenseDto: CreateExpenseDto, @GetUser() user: User) {
    createExpenseDto.empleado_id = user.id;
    createExpenseDto.companyId = createExpenseDto.companyId ?? user.companyId;
    return this.expensesService.create(createExpenseDto);
  }

  @Get()
  @UserProtected(Roles.ADMIN)
  findAll(@Query() filtros: FiltrarGastosDto) {
    return this.expensesService.findAll(filtros);
  }

  // --- Cuentas por pagar ---
  // Declarados ANTES de ':id' para que Nest no los tome como un uuid.

  /** GET /expenses/resumen — los KPIs que se miran antes que la lista */
  @Get('resumen')
  @UserProtected(Roles.ADMIN)
  resumen(@GetUser() user: User) {
    return this.expensesService.resumen(user.companyId);
  }

  /**
   * POST /expenses/pagar-proveedor — un pago global que el sistema imputa
   * FIFO sobre los comprobantes pendientes del proveedor.
   */
  @Post('pagar-proveedor')
  @UserProtected(Roles.ADMIN)
  pagarProveedor(@Body() dto: PagarProveedorDto, @GetUser() user: User) {
    dto.empleado_id = user.id;
    return this.expensesService.pagarProveedor(dto);
  }

  /** POST /expenses/anticipos — plata a cuenta de un proveedor. */
  @Post('anticipos')
  @UserProtected(Roles.ADMIN)
  crearAnticipo(@Body() dto: CrearAnticipoDto, @GetUser() user: User) {
    return this.expensesService.crearAnticipo({
      ...dto,
      empleado_id: user.id,
      companyId: user.companyId,
    });
  }

  /** GET /expenses/anticipos/:proveedorId — saldo a favor disponible. */
  @Get('anticipos/:proveedorId')
  @UserProtected(Roles.ADMIN)
  anticiposDe(@Param('proveedorId') proveedorId: string) {
    return this.expensesService.anticiposDe(proveedorId);
  }

  /** PATCH /expenses/anticipos/:id/anular — cargado por error, sin consumir. */
  @Patch('anticipos/:id/anular')
  @UserProtected(Roles.ADMIN)
  @Auditable({ accion: AccionAuditada.PAGO_ANULADO, entidad: 'supplier_advance', campoMotivo: 'motivo' })
  anularAnticipo(@Param('id') id: string, @Body() dto: AnulacionDto) {
    return this.expensesService.anularAnticipo(id, dto.motivo, dto.destino);
  }

  /**
   * POST /expenses/upload-comprobante — la foto del ticket o la factura.
   * Mismo patrón que las imágenes de productos; carpeta propia.
   */
  @Post('upload-comprobante')
  @UserProtected(Roles.ADMIN)
  @UseInterceptors(FileInterceptor('file', {
    fileFilter: (req, file, cb) => {
      // Fotos y PDFs: un comprobante puede llegar de las dos formas.
      if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp|pdf)$/)) {
        return cb(new BadRequestException('Solo se permiten imágenes o PDF'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 },
  }))
  uploadComprobante(@UploadedFile() file?: Express.Multer.File) {
    return this.subidas.archivoCrudo('comprobantes', file);
  }

  /** GET /expenses/cuentas-por-pagar — deuda agrupada por proveedor */
  @Get('cuentas-por-pagar')
  @UserProtected(Roles.ADMIN)
  // SEG-07: la empresa es la de la sesión, nunca un ?companyId= del cliente.
  cuentasPorPagar(@GetUser() user: User) {
    return this.expensesService.cuentasPorPagar(user.companyId);
  }

  /** GET /expenses/vencimientos?dias=30 — que hay que pagar y cuando */
  @Get('vencimientos')
  @UserProtected(Roles.ADMIN)
  vencimientos(@GetUser() user: User, @Query('dias') dias?: string) {
    return this.expensesService.vencimientos(dias ? parseInt(dias, 10) : 30, user.companyId);
  }

  /** GET /expenses/pendientes-aprobacion — los que esperan una firma */
  @Get('pendientes-aprobacion')
  @UserProtected(Roles.ADMIN)
  pendientesDeAprobacion(@GetUser() user: User) {
    return this.expensesService.pendientesDeAprobacion(user.companyId);
  }

  @Get(':id')
  @UserProtected(Roles.ADMIN)
  findOne(@Param('id') id: string) {
    return this.expensesService.findOne(id);
  }

  @Patch(':id')
  @UserProtected(Roles.ADMIN)
  update(@Param('id') id: string, @Body() updateExpenseDto: UpdateExpenseDto) {
    return this.expensesService.update(id, updateExpenseDto);
  }

  /** POST /expenses/:id/pagos — imputa un pago y mueve la plata */
  @Post(':id/pagos')
  @UserProtected(Roles.ADMIN)
  pagar(@Param('id') id: string, @Body() dto: PagarGastoDto, @GetUser() user: User) {
    // Siempre el usuario autenticado. Antes el body podía traer un
    // `empleado_id` ajeno y el pago quedaba firmado por otra persona.
    dto.empleado_id = user.id;
    return this.expensesService.pagar(id, dto);
  }

  /** PATCH /expenses/pagos/:pagoId/anular — revierte el pago en el ledger */
  @Patch('pagos/:pagoId/anular')
  @UserProtected(Roles.ADMIN)
  @Auditable({ accion: AccionAuditada.PAGO_ANULADO, entidad: 'expense_payment', campoMotivo: 'motivo' })
  anularPago(@Param('pagoId') pagoId: string, @Body() dto: AnulacionDto) {
    return this.expensesService.anularPago(pagoId, dto.motivo, dto.destino);
  }

  @Patch(':id/anular')
  @UserProtected(Roles.ADMIN)
  @Auditable({ accion: AccionAuditada.GASTO_ANULADO, entidad: 'expense', campoMotivo: 'motivo' })
  anular(@Param('id') id: string, @Body() dto: AnulacionDto) {
    return this.expensesService.anular(id, dto.motivo, dto.destino);
  }

  /** PATCH /expenses/:id/aprobar */
  @Patch(':id/aprobar')
  @UserProtected(Roles.ADMIN)
  @Auditable({ accion: AccionAuditada.GASTO_APROBADO, entidad: 'expense' })
  aprobar(@Param('id') id: string, @GetUser() user: User) {
    return this.expensesService.aprobar(id, user.id);
  }

  /** PATCH /expenses/:id/rechazar */
  @Patch(':id/rechazar')
  @UserProtected(Roles.ADMIN)
  @Auditable({ accion: AccionAuditada.GASTO_RECHAZADO, entidad: 'expense', campoMotivo: 'motivo' })
  rechazar(
    @Param('id') id: string,
    @Body() dto: RechazoGastoDto,
    @GetUser() user: User,
  ) {
    return this.expensesService.rechazar(id, user.id, dto.motivo as string);
  }

  @Delete(':id')
  @UserProtected(Roles.ADMIN)
  remove(@Param('id') id: string) {
    return this.expensesService.remove(id);
  }
}
