import sharp from 'sharp';
import { formatoDeFoto } from '../common/tipo-archivo.util';
import { ErrorDeNegocio } from '../common/errores/error-negocio';

/**
 * Compresión de fotos antes de guardarlas. Pedido explícito del usuario
 * (07/09/2026): "que sea eficiente la forma de almacenar las fotos, no quiero
 * que ocupen mucho espacio". Una foto de celular pesa 3–8 MB en JPEG de 4000
 * px; para ver una placa quemada en la OS alcanzan 1600 px en WebP (100–250
 * KB). La miniatura de 320 px es lo único que carga la grilla.
 */
export const LADO_MAXIMO = 1600;
export const LADO_MINIATURA = 320;

export interface FotoComprimida {
  principal: Buffer;
  miniatura: Buffer;
  ancho: number;
  alto: number;
}

/** Ver SEG-35 en `comprimirFoto`. */
export const LIMITE_PIXELES_FOTO = 50_000_000;

export async function comprimirFoto(original: Buffer): Promise<FotoComprimida> {
  // SEG-09: por los bytes ANTES de `sharp`. El mimetype lo declara el
  // navegador; sin esto, cualquier archivo (un svg, un tiff armado) llegaba a
  // los decodificadores de libvips desde las subidas autenticadas.
  if (!formatoDeFoto(original)) {
    throw new ErrorDeNegocio('DATOS_INVALIDOS', 'El archivo no es una foto (jpg, png, webp o heic).');
  }
  // `rotate()` sin argumentos aplica la orientación EXIF del celular y la
  // descarta: si no, la foto se guarda acostada y el visor la endereza solo a
  // veces. `withoutEnlargement`: una foto chica no se infla.
  //
  // SEG-35: tope de píxeles. Un PNG de 16000×16000 de un solo color pesa poco
  // y pasa el límite de 10 MB, pero decodificado ocupa ~1 GB: desde el
  // formulario público de pedir servicio tiraba el proceso (512 MB en Render).
  // 50 MP alcanza para la cámara principal de cualquier celular en modo normal.
  const base = sharp(original, { failOn: 'error', limitInputPixels: LIMITE_PIXELES_FOTO }).rotate();
  try {
    const { data: principal, info } = await base
      .clone()
      .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true });
    const miniatura = await base
      .clone()
      .resize({ width: LADO_MINIATURA, height: LADO_MINIATURA, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
    return { principal, miniatura, ancho: info.width, alto: info.height };
  } catch (e) {
    if (/pixel limit/i.test((e as Error).message ?? '')) {
      throw new ErrorDeNegocio('DATOS_INVALIDOS', 'La foto es demasiado grande. Sacala con menos resolución.');
    }
    throw e;
  }
}
