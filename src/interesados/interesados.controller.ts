import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';

import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { User } from '../auth/entities/user.entity';
import { Roles } from '../enums/roles.enum';
import { ConsultaWebDto, CotizarDto, CrearInteresadoDto, EditarInteresadoDto, ListarInteresadosDto, MoverInteresadoDto, NotaDto } from './interesados.dtos';
import { SitioService } from '../unidades/sitio.service';
import { InteresadosService, MAXIMO_FOTOS_CONSULTA } from './interesados.service';

/**
 * Las fotos del auto que alguien ofrece desde el sitio. El sitio las achica
 * antes de mandarlas, así que el tope por archivo es bajo. Un pedido sin
 * archivos (JSON) pasa de largo.
 */
const FOTOS = FilesInterceptor('fotos', MAXIMO_FOTOS_CONSULTA, {
  storage: memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.mimetype)) {
      return cb(new BadRequestException('Sólo se permiten fotos (jpg, png, webp).'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 8 * 1024 * 1024, files: MAXIMO_FOTOS_CONSULTA },
});

/** Interesados: del dueño y del vendedor (hoy el puesto «mostrador»), como las ventas. */
@Controller('interesados')
export class InteresadosController {
  constructor(private readonly service: InteresadosService) {}

  @Get()
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  listar(@Query() dto: ListarInteresadosDto) {
    return this.service.listar(dto);
  }

  @Get('de-unidad/:unidadId')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  deUnidad(@Param('unidadId', ParseUUIDPipe) unidadId: string) {
    return this.service.deUnidad(unidadId);
  }

  @Get(':id')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.obtener(id);
  }

  @Post()
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  crear(@Body() dto: CrearInteresadoDto, @GetUser() user: User) {
    return this.service.crear(dto, user);
  }

  @Patch(':id')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  editar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarInteresadoDto) {
    return this.service.editar(id, dto);
  }

  @Post(':id/etapa')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  mover(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MoverInteresadoDto, @GetUser() user: User) {
    return this.service.mover(id, dto, user);
  }

  @Post(':id/cotizacion')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  cotizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CotizarDto, @GetUser() user: User) {
    return this.service.cotizar(id, dto, user);
  }

  @Post(':id/notas')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  anotar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: NotaDto, @GetUser() user: User) {
    return this.service.anotar(id, dto, user);
  }

  @Post(':id/fotos')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  @UseInterceptors(FOTOS)
  subirFotos(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() fotos: Express.Multer.File[] | undefined,
    @GetUser() user: User,
  ) {
    return this.service.subirFotos(id, (fotos ?? []).map((f) => f.buffer), user);
  }

  @Delete(':id/fotos/:indice')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  borrarFoto(@Param('id', ParseUUIDPipe) id: string, @Param('indice', ParseIntPipe) indice: number) {
    return this.service.borrarFoto(id, indice);
  }
}

/** La consulta del sitio público: sin login y con un límite propio, bajo, porque escribe en la base. */
@Controller('catalogo')
export class ConsultasController {
  constructor(private readonly service: InteresadosService, private readonly sitio: SitioService) {}

  @Post('consultas')
  @Throttle({ short: { ttl: 60000, limit: 5 }, medium: { ttl: 3600000, limit: 20 } })
  @UseInterceptors(FOTOS)
  async consultar(@Body() dto: ConsultaWebDto, @UploadedFiles() fotos: Express.Multer.File[] | undefined, @Headers('x-agencia') agencia?: string) {
    return this.service.consultaWeb(dto, await this.sitio.empresaDe(agencia), (fotos ?? []).map((f) => f.buffer));
  }
}
