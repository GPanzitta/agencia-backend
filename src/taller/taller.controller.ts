import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { User } from '../auth/entities/user.entity';
import { Roles } from '../enums/roles.enum';
import {
  AgregarRepuestoOrdenDto,
  AjustarStockRepuestoDto,
  CambiarEstadoOrdenAlistajeDto,
  CrearOrdenAlistajeDto,
  CrearOrdenCompraTallerDto,
  CrearRepuestoAutoDto,
  EditarOrdenAlistajeDto,
  EditarRepuestoAutoDto,
  RecibirOrdenCompraTallerDto,
} from './taller.dtos';
import { TallerService } from './taller.service';

const TODOS_LOS_PUESTOS = [Roles.ADMIN, Roles.MOSTRADOR, Roles.TECNICO, Roles.PANOL];

const FOTOS_ORDEN = FilesInterceptor('fotos', 10, {
  storage: memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.mimetype)) {
      return cb(new BadRequestException('Sólo se permiten fotos (jpg, png, webp).'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 12 * 1024 * 1024, files: 10 },
});

@Controller('taller')
export class TallerController {
  constructor(private readonly service: TallerService) {}

  // ─── Pañol de Repuestos e Insumos Automotrices ─────────────────────────────

  @Get('repuestos')
  @UserProtected(...TODOS_LOS_PUESTOS)
  listarRepuestos(
    @Query('q') q?: string,
    @Query('categoria') categoria?: string,
    @Query('bajo_stock') bajoStock?: string,
  ) {
    return this.service.listarRepuestos(q, categoria, bajoStock === '1' || bajoStock === 'true');
  }

  @Post('repuestos')
  @UserProtected(...TODOS_LOS_PUESTOS)
  crearRepuesto(@Body() dto: CrearRepuestoAutoDto, @GetUser() user: User) {
    return this.service.crearRepuesto(dto, user);
  }

  @Patch('repuestos/:id')
  @UserProtected(...TODOS_LOS_PUESTOS)
  editarRepuesto(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarRepuestoAutoDto) {
    return this.service.editarRepuesto(id, dto);
  }

  @Post('repuestos/:id/stock')
  @UserProtected(...TODOS_LOS_PUESTOS)
  ajustarStock(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AjustarStockRepuestoDto) {
    return this.service.ajustarStockRepuesto(id, dto);
  }

  @Delete('repuestos/:id')
  @UserProtected(Roles.ADMIN, Roles.PANOL)
  borrarRepuesto(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.borrarRepuesto(id);
  }

  @Post('repuestos/:id/fotos')
  @UserProtected(...TODOS_LOS_PUESTOS)
  @UseInterceptors(FOTOS_ORDEN)
  subirFotosRepuesto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() fotos: Express.Multer.File[] | undefined,
  ) {
    return this.service.subirFotosRepuesto(id, (fotos ?? []).map((f) => f.buffer));
  }

  @Delete('repuestos/:id/fotos/:fotoId')
  @UserProtected(...TODOS_LOS_PUESTOS)
  borrarFotoRepuesto(@Param('id', ParseUUIDPipe) id: string, @Param('fotoId') fotoId: string) {
    return this.service.borrarFotoRepuesto(id, fotoId);
  }

  // ─── Órdenes de Compra de Repuestos (OC) ──────────────────────────────────

  @Get('compras')
  @UserProtected(...TODOS_LOS_PUESTOS)
  listarCompras(@Query('orden_id') ordenId?: string, @Query('estado') estado?: string) {
    return this.service.listarCompras(ordenId, estado);
  }

  @Post('compras')
  @UserProtected(...TODOS_LOS_PUESTOS)
  crearCompra(@Body() dto: CrearOrdenCompraTallerDto, @GetUser() user: User) {
    return this.service.crearCompra(dto, user);
  }

  @Post('compras/:id/recibir')
  @UserProtected(...TODOS_LOS_PUESTOS)
  recibirCompra(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecibirOrdenCompraTallerDto, @GetUser() user: User) {
    return this.service.recibirCompra(id, dto, user);
  }

  @Post('compras/:id/cancelar')
  @UserProtected(...TODOS_LOS_PUESTOS)
  cancelarCompra(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.service.cancelarCompra(id, user);
  }

  // ─── Órdenes de Alistaje y Taller (OA) ────────────────────────────────────

  @Get('ordenes')
  @UserProtected(...TODOS_LOS_PUESTOS)
  listarOrdenes(@Query('vista') vista?: string, @Query('unidad_id') unidadId?: string) {
    return this.service.listarOrdenes(vista, unidadId);
  }

  @Get('ordenes/:id')
  @UserProtected(...TODOS_LOS_PUESTOS)
  obtenerOrden(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.obtenerOrden(id);
  }

  @Post('ordenes')
  @UserProtected(...TODOS_LOS_PUESTOS)
  crearOrden(@Body() dto: CrearOrdenAlistajeDto, @GetUser() user: User) {
    return this.service.crearOrden(dto, user);
  }

  @Patch('ordenes/:id')
  @UserProtected(...TODOS_LOS_PUESTOS)
  editarOrden(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarOrdenAlistajeDto, @GetUser() user: User) {
    return this.service.editarOrden(id, dto, user);
  }

  @Post('ordenes/:id/estado')
  @UserProtected(...TODOS_LOS_PUESTOS)
  cambiarEstado(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CambiarEstadoOrdenAlistajeDto, @GetUser() user: User) {
    return this.service.cambiarEstadoOrden(id, dto, user);
  }

  @Post('ordenes/:id/repuestos')
  @UserProtected(...TODOS_LOS_PUESTOS)
  agregarRepuesto(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AgregarRepuestoOrdenDto, @GetUser() user: User) {
    return this.service.agregarRepuestoAOrden(id, dto, user);
  }

  @Post('ordenes/:id/repuestos/:renglonId/consumir')
  @UserProtected(...TODOS_LOS_PUESTOS)
  consumirRepuesto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('renglonId', ParseUUIDPipe) renglonId: string,
    @GetUser() user: User,
  ) {
    return this.service.consumirRepuestoDeOrden(id, renglonId, user);
  }

  @Delete('ordenes/:id/repuestos/:renglonId')
  @UserProtected(...TODOS_LOS_PUESTOS)
  quitarRepuesto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('renglonId', ParseUUIDPipe) renglonId: string,
    @GetUser() user: User,
  ) {
    return this.service.quitarRepuestoDeOrden(id, renglonId, user);
  }

  @Post('ordenes/:id/fotos')
  @UserProtected(...TODOS_LOS_PUESTOS)
  @UseInterceptors(FOTOS_ORDEN)
  subirFotos(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() fotos: Express.Multer.File[] | undefined,
    @Body('nota') nota: string | undefined,
    @Body('etapa') etapa: string | undefined,
    @GetUser() user: User,
  ) {
    return this.service.subirFotosOrden(id, (fotos ?? []).map((f) => f.buffer), nota, etapa, user);
  }

  @Delete('ordenes/:id/fotos/:fotoId')
  @UserProtected(...TODOS_LOS_PUESTOS)
  borrarFoto(@Param('id', ParseUUIDPipe) id: string, @Param('fotoId') fotoId: string) {
    return this.service.borrarFotoOrden(id, fotoId);
  }
}
