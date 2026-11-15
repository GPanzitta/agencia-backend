import {
  BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { PerfilPublicoService } from './perfil-publico.service';
import { ActualizarPerfilPublicoDto, CAMPOS_IMAGEN, CampoImagen } from './dto/perfil-publico.dtos';
import { SUBIDA_VIDEO, extensionVerificada } from './video.subida';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { User } from '../auth/entities/user.entity';
import { Roles } from '../enums/roles.enum';

/** Mismo filtro y tope que las fotos de la orden: el original nunca toca el disco. */
const SUBIDA_IMAGEN = {
  storage: memoryStorage(),
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (e: Error | null, ok: boolean) => void) => {
    if (!file.mimetype.match(/\/(jpg|jpeg|png|webp|heic|heif)$/)) {
      return cb(new BadRequestException('Solo se permiten imágenes (jpg, png, webp)'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 15 * 1024 * 1024 },
};

/**
 * Configuración → Sitio web (S1a §3.3). Lee cualquier usuario logueado (la
 * vista previa), escribe el admin: es lo que el taller muestra en la calle.
 */
@Controller('companies/mi-empresa/perfil-publico')
export class PerfilPublicoController {
  constructor(private readonly service: PerfilPublicoService) {}

  @Get()
  @Auth()
  obtener(@GetUser() user: User) {
    return this.service.obtener(user.companyId);
  }

  @Patch()
  @UserProtected(Roles.ADMIN)
  actualizar(@GetUser() user: User, @Body() dto: ActualizarPerfilPublicoDto) {
    return this.service.actualizar(user.companyId, dto);
  }

  /** Mismo filtro y tope que las fotos de la orden: el original nunca toca el disco. */
  @Post('imagenes/:campo')
  @UserProtected(Roles.ADMIN)
  @UseInterceptors(FileInterceptor('file', SUBIDA_IMAGEN))
  subirImagen(
    @GetUser() user: User,
    @Param('campo') campo: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!(CAMPOS_IMAGEN as readonly string[]).includes(campo)) {
      throw new BadRequestException(`Campo de imagen desconocido: ${campo}`);
    }
    if (!file) throw new BadRequestException('Archivo no proporcionado');
    return this.service.subirImagen(user.companyId, campo as CampoImagen, file.buffer);
  }

  @Delete('trabajos/:indice')
  @UserProtected(Roles.ADMIN)
  borrarTrabajo(@GetUser() user: User, @Param('indice', ParseIntPipe) indice: number) {
    return this.service.borrarTrabajo(user.companyId, indice);
  }

  /**
   * El video de portada. Mismo esquema que las imágenes (memoria, nunca
   * disco), con el filtro y el tope propios del video: 25 MB y sólo los dos
   * formatos que el navegador reproduce en bucle sin plugins.
   */
  @Post('video')
  @UserProtected(Roles.ADMIN)
  @UseInterceptors(FileInterceptor('file', SUBIDA_VIDEO))
  subirVideo(@GetUser() user: User, @UploadedFile() file: Express.Multer.File) {
    return this.service.subirVideo(user.companyId, file?.buffer, extensionVerificada(file));
  }

  @Delete('video')
  @UserProtected(Roles.ADMIN)
  quitarVideo(@GetUser() user: User) {
    return this.service.quitarVideo(user.companyId);
  }

  // ─── Fotos del sitio (spec 2026-10-18) ─────────────────────────────────

  @Get('fotos-sitio')
  @Auth()
  fotosSitio(@GetUser() user: User) {
    return this.service.fotosSitio(user.companyId);
  }

  @Post('fotos-sitio/:clave/:posicion')
  @UserProtected(Roles.ADMIN)
  @UseInterceptors(FileInterceptor('file', SUBIDA_IMAGEN))
  subirFotoSitio(
    @GetUser() user: User,
    @Param('clave') clave: string,
    @Param('posicion', ParseIntPipe) posicion: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Archivo no proporcionado');
    return this.service.subirFotoSitio(user.companyId, clave, posicion, file.buffer);
  }

  @Delete('fotos-sitio/:clave/:posicion')
  @UserProtected(Roles.ADMIN)
  quitarFotoSitio(
    @GetUser() user: User,
    @Param('clave') clave: string,
    @Param('posicion', ParseIntPipe) posicion: number,
  ) {
    return this.service.quitarFotoSitio(user.companyId, clave, posicion);
  }

  @Post('video-portada')
  @UserProtected(Roles.ADMIN)
  @UseInterceptors(FileInterceptor('file', SUBIDA_VIDEO))
  subirVideoPortada(@GetUser() user: User, @UploadedFile() file: Express.Multer.File) {
    return this.service.subirVideoPortada(user.companyId, file?.buffer, extensionVerificada(file));
  }

  @Delete('video-portada')
  @UserProtected(Roles.ADMIN)
  quitarVideoPortada(@GetUser() user: User) {
    return this.service.quitarVideoPortada(user.companyId);
  }
}
