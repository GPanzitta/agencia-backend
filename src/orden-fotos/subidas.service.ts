import { BadRequestException, Injectable } from '@nestjs/common';
import { FotosAlmacen } from './fotos.almacen';
import { comprimirFoto } from './fotos.util';
import { formatoDeArchivo } from '../common/tipo-archivo.util';

const EXTENSION_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

/** La extensión con la que se guarda un archivo sale del mime, no del nombre que mandó el navegador. */
export function extensionDeMime(mime: string): string | null {
  return EXTENSION_POR_MIME[mime] ?? null;
}

/**
 * Los endpoints `upload-*` que reciben un archivo suelto (foto de recepción,
 * foto de nota técnica, comprobante de gasto, remito de OC). Antes cada uno
 * tenía su `multer.diskStorage`; ahora el archivo llega en memoria y va al
 * `FotosAlmacen` (disco o Cloudinary). Las fotos se comprimen igual que las de
 * la orden: un JPEG de celular pesa 3–8 MB y en WebP de 1600 px queda en
 * 100–250 KB.
 */
@Injectable()
export class SubidasService {
  constructor(private readonly almacen: FotosAlmacen) {}

  async fotoComprimida(subcarpeta: string, archivo: Express.Multer.File | undefined): Promise<{ url: string }> {
    if (!archivo) throw new BadRequestException('Archivo no proporcionado');
    const comprimida = await comprimirFoto(archivo.buffer).catch(() => {
      throw new BadRequestException('El archivo no es una imagen válida');
    });
    return this.almacen.guardarArchivo(subcarpeta, comprimida.principal, 'webp');
  }

  async archivoCrudo(subcarpeta: string, archivo: Express.Multer.File | undefined): Promise<{ url: string }> {
    if (!archivo) throw new BadRequestException('Archivo no proporcionado');
    // SEG-09: la extensión sale de los bytes; el mimetype tiene que decir lo
    // mismo. Un html declarado como image/png ya no se guarda como .png.
    const real = formatoDeArchivo(archivo.buffer);
    const declarada = extensionDeMime(archivo.mimetype);
    if (!real || real !== declarada) {
      throw new BadRequestException('Tipo de archivo no admitido');
    }
    const extension = real;
    return this.almacen.guardarArchivo(subcarpeta, archivo.buffer, extension);
  }
}
