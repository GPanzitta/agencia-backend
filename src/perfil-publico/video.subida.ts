import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

import { formatoDeVideo } from '../common/tipo-archivo.util';
import { MIMES_VIDEO, TOPE_VIDEO_BYTES, extensionDeVideo, type ExtensionVideo } from './video.util';

/**
 * Videos: mismo esquema que las imágenes (memoria, nunca disco), con el filtro
 * y el tope propios: 25 MB y sólo los dos formatos que el navegador reproduce
 * en bucle sin plugins.
 */
export const SUBIDA_VIDEO = {
  storage: memoryStorage(),
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (e: Error | null, ok: boolean) => void) => {
    if (!extensionDeVideo(file.mimetype)) {
      return cb(new BadRequestException(`Solo se permiten videos ${MIMES_VIDEO.join(' o ')}`), false);
    }
    cb(null, true);
  },
  limits: { fileSize: TOPE_VIDEO_BYTES },
};

/** SEG-09: el formato real (los bytes) tiene que ser el declarado. */
export function extensionVerificada(file: Express.Multer.File | undefined): ExtensionVideo {
  if (!file) throw new BadRequestException('Archivo no proporcionado');
  const extension = extensionDeVideo(file.mimetype);
  if (!extension || formatoDeVideo(file.buffer) !== extension) {
    throw new BadRequestException(`Solo se permiten videos ${MIMES_VIDEO.join(' o ')}`);
  }
  return extension;
}
