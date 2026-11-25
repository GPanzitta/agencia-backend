import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { User } from '../auth/entities/user.entity';
import { Roles } from '../enums/roles.enum';
import { AnularDto, CerrarDto, ComisionDto, ListarOperacionesDto, PagoDto, PeriodoDto, PorcentajeDto, ReservarDto } from './dto/operaciones.dtos';
import { OperacionesService } from './operaciones.service';

const FOTOS_OV = FilesInterceptor('fotos', 10, {
  storage: memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.mimetype)) {
      return cb(new BadRequestException('Sólo se permiten fotos (jpg, png, webp).'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 12 * 1024 * 1024, files: 10 },
});

/**
 * Operaciones de venta (diseño del 12/11/2026). Reserva y cobra el vendedor
 * (hoy el rol «mostrador») y el admin; cerrar la venta y anularla, sólo el admin:
 * es entregar el auto y es devolver plata.
 */
@Controller('operaciones')
export class OperacionesController {
  constructor(private readonly service: OperacionesService) {}

  @Get()
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  listar(@Query() dto: ListarOperacionesDto) {
    return this.service.listar(dto);
  }

  /** Las comisiones del período: el dueño ve las de todos; el vendedor, las suyas. */
  @Get('comisiones')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  comisiones(@Query() dto: PeriodoDto, @GetUser() user: User) {
    return this.service.comisiones(dto, user, user.role?.nombre !== Roles.ADMIN);
  }

  @Put('comisiones/vendedores/:id')
  @UserProtected(Roles.ADMIN)
  porcentaje(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PorcentajeDto, @GetUser() user: User) {
    return this.service.porcentajeDe(id, dto.pct ?? null, user);
  }

  @Post(':id/comision')
  @UserProtected(Roles.ADMIN)
  ajustarComision(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ComisionDto) {
    return this.service.ajustarComision(id, dto);
  }

  @Get(':id')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.obtener(id);
  }

  @Post()
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  reservar(@Body() dto: ReservarDto, @GetUser() user: User) {
    return this.service.reservar(dto, user);
  }

  @Post(':id/pagos')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  agregarPago(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PagoDto, @GetUser() user: User) {
    return this.service.agregarPago(id, dto, user);
  }

  @Delete(':id/pagos/:pagoId')
  @UserProtected(Roles.ADMIN)
  quitarPago(@Param('id', ParseUUIDPipe) id: string, @Param('pagoId', ParseUUIDPipe) pagoId: string, @GetUser() user: User) {
    return this.service.quitarPago(id, pagoId, user);
  }

  @Post(':id/cerrar')
  @UserProtected(Roles.ADMIN)
  cerrar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CerrarDto) {
    return this.service.cerrar(id, dto);
  }

  @Post(':id/anular')
  @UserProtected(Roles.ADMIN)
  anular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnularDto, @GetUser() user: User) {
    return this.service.anular(id, dto, user);
  }

  @Post(':id/fotos')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  @UseInterceptors(FOTOS_OV)
  subirFotos(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() fotos: Express.Multer.File[] | undefined,
    @Body('nota') nota: string | undefined,
    @Body('etapa') etapa: string | undefined,
    @GetUser() user: User,
  ) {
    return this.service.subirFotos(id, (fotos ?? []).map((f) => f.buffer), nota, etapa, user);
  }

  @Delete(':id/fotos/:fotoId')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  borrarFoto(@Param('id', ParseUUIDPipe) id: string, @Param('fotoId') fotoId: string) {
    return this.service.borrarFoto(id, fotoId);
  }
}
