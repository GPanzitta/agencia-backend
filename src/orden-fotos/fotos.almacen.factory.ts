import { Logger } from '@nestjs/common';
import { FotosAlmacen } from './fotos.almacen';
import { FotosAlmacenDisco } from './fotos.almacen.disco';
import { FotosAlmacenCloudinary } from './fotos.almacen.cloudinary';
import { hayCloudinary } from './cloudinary.util';
import { subidorCloudinary } from './subidor.cloudinary';

/**
 * Elige el almacén por entorno: `CLOUDINARY_URL` presente → Cloudinary (con
 * `CLOUDINARY_CARPETA` como prefijo opcional); si no, el disco local.
 */
export function crearFotosAlmacen(env: { CLOUDINARY_URL?: string; CLOUDINARY_CARPETA?: string }): FotosAlmacen {
  if (hayCloudinary(env)) {
    Logger.log(`Fotos en Cloudinary${env.CLOUDINARY_CARPETA ? ` (carpeta ${env.CLOUDINARY_CARPETA})` : ''}`, 'FotosAlmacen');
    return new FotosAlmacenCloudinary(subidorCloudinary(), env.CLOUDINARY_CARPETA || undefined);
  }
  Logger.log('Fotos en disco local (uploads/)', 'FotosAlmacen');
  return new FotosAlmacenDisco();
}
