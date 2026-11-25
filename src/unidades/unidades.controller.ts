import {
  BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { User } from '../auth/entities/user.entity';
import { Roles } from '../enums/roles.enum';
import { CambiarEstadoDto, ConfigurarSitioDto, CrearUnidadDto, EditarUnidadDto, GastoDto, ListarUnidadesDto, PapelDto, PublicacionDto, PublicarDto } from './dto/unidades.dtos';
import { SitioService } from './sitio.service';
import { UnidadesService } from './unidades.service';
import { VistaUnidad, vistaPara } from './unidades.vista';

const IMAGEN = FileInterceptor('file', {
  storage: memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.match(/\/(jpg|jpeg|png|webp|heic|heif)$/)) {
      return cb(new BadRequestException('Solo se permiten imágenes (jpg, png, webp)'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 15 * 1024 * 1024 },
});

/** Todos los puestos de la agencia ven el stock y cargan gastos, papeles y fotos. */
const TODOS = [Roles.ADMIN, Roles.MOSTRADOR, Roles.PANOL, Roles.TECNICO];
/** Dar de alta, poner precio, publicar y sacar del stock: el admin y el vendedor (hoy «mostrador»). */
const COMERCIAL = [Roles.ADMIN, Roles.MOSTRADOR];

/** Lo que ve cada puesto: sólo el dueño recibe costos y margen. */
const para = async <T extends VistaUnidad | VistaUnidad[]>(user: User, v: Promise<T>): Promise<T> => vistaPara(user.role?.nombre, await v);

/** El stock de unidades de la agencia (diseño del 12/11/2026). */
@Controller('unidades')
export class UnidadesController {
  constructor(private readonly service: UnidadesService, private readonly sitio: SitioService) {}

  /** La dirección del sitio de esta agencia (se le asigna una la primera vez). */
  @Get('sitio')
  @UserProtected(...TODOS)
  direccionDelSitio(@GetUser() user: User) {
    return this.sitio.direccionDe(user.companyId as string);
  }

  /** Sólo el dueño decide qué muestra su sitio. */
  @Put('sitio')
  @UserProtected(Roles.ADMIN)
  configurarSitio(@Body() dto: ConfigurarSitioDto, @GetUser() user: User) {
    return this.sitio.configurar(user.companyId as string, dto);
  }

  @Get()
  @UserProtected(...TODOS)
  listar(@Query() dto: ListarUnidadesDto, @GetUser() user: User) {
    return para(user, this.service.listar(dto));
  }

  @Get('resumen')
  @UserProtected(Roles.ADMIN)
  resumen() {
    return this.service.resumen();
  }

  @Get(':id')
  @UserProtected(...TODOS)
  obtener(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return para(user, this.service.obtener(id));
  }

  @Post()
  @UserProtected(...COMERCIAL)
  crear(@Body() dto: CrearUnidadDto, @GetUser() user: User) {
    return para(user, this.service.crear(dto, user));
  }

  /**
   * Lee una página pública con autos publicados (por ejemplo el sitio viejo de la
   * agencia) y devuelve las unidades detectadas para previsualizar e importar al stock.
   */
  @Post('leer-sitio')
  @UserProtected(...COMERCIAL)
  leerSitio(@Body('url') url: string) {
    return this.service.leerSitioExterno(url);
  }

  @Patch(':id')
  @UserProtected(...COMERCIAL)
  editar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarUnidadDto, @GetUser() user: User) {
    return para(user, this.service.editar(id, dto));
  }

  @Post(':id/estado')
  @UserProtected(...COMERCIAL)
  cambiarEstado(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CambiarEstadoDto, @GetUser() user: User) {
    return para(user, this.service.cambiarEstado(id, dto));
  }

  @Post(':id/publicar')
  @UserProtected(...COMERCIAL)
  publicar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PublicarDto, @GetUser() user: User) {
    return para(user, this.service.publicar(id, dto));
  }

  @Put(':id/publicacion')
  @UserProtected(...COMERCIAL)
  guardarPublicacion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PublicacionDto, @GetUser() user: User) {
    return para(user, this.service.guardarPublicacion(id, dto));
  }

  @Post(':id/gastos')
  @UserProtected(...TODOS)
  agregarGasto(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GastoDto, @GetUser() user: User) {
    return para(user, this.service.agregarGasto(id, dto, user));
  }

  @Delete(':id/gastos/:gastoId')
  @UserProtected(...COMERCIAL)
  quitarGasto(@Param('id', ParseUUIDPipe) id: string, @Param('gastoId', ParseUUIDPipe) gastoId: string, @GetUser() user: User) {
    return para(user, this.service.quitarGasto(id, gastoId));
  }

  @Put(':id/papeles/:tipo')
  @UserProtected(...TODOS)
  actualizarPapel(@Param('id', ParseUUIDPipe) id: string, @Param('tipo') tipo: string, @Body() dto: PapelDto, @GetUser() user: User) {
    return para(user, this.service.actualizarPapel(id, tipo, dto));
  }

  @Post(':id/fotos')
  @UserProtected(...TODOS)
  @UseInterceptors(IMAGEN)
  subirFoto(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File, @GetUser() user: User) {
    if (!file) throw new BadRequestException('Archivo no proporcionado');
    return para(user, this.service.subirFoto(id, file.buffer, user));
  }

  @Post(':id/fotos/:fotoId/portada')
  @UserProtected(...TODOS)
  fotoDePortada(@Param('id', ParseUUIDPipe) id: string, @Param('fotoId', ParseUUIDPipe) fotoId: string, @GetUser() user: User) {
    return para(user, this.service.fotoDePortada(id, fotoId));
  }

  @Delete(':id/fotos/:fotoId')
  @UserProtected(...COMERCIAL)
  borrarFoto(@Param('id', ParseUUIDPipe) id: string, @Param('fotoId', ParseUUIDPipe) fotoId: string, @GetUser() user: User) {
    return para(user, this.service.borrarFoto(id, fotoId));
  }
}
