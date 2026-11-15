import sharp from 'sharp';

/**
 * Le saca al logo o al isotipo el borde de color parejo (spec 2026-10-01 §3.1):
 * el logo de GUSMAT era 1024×572 con la marca en el medio y la cabecera lo
 * achicaba a 32 px. Si la imagen es toda de un color, no tiene borde que sacar
 * o no se puede leer, se devuelve la original: un logo raro no puede impedir
 * la subida.
 */
export async function recortarBorde(original: Buffer): Promise<Buffer> {
  try {
    const meta = await sharp(original, { failOn: 'error' }).metadata();
    // Con orientación EXIF 5–8 el ancho y el alto de la imagen ya derecha se invierten.
    const girada = (meta.orientation ?? 1) >= 5;
    const width = girada ? meta.height : meta.width;
    const height = girada ? meta.width : meta.height;
    // La orientación se aplica ANTES de recortar: trim() descarta el EXIF y después nadie sabría girarla.
    const { data, info } = await sharp(original, { failOn: 'error' }).rotate().trim({ threshold: 20 }).toBuffer({ resolveWithObject: true });
    // sharp re-codifica aunque no haya nada que recortar: sin cambio de tamaño, la original.
    const recorto = info.width > 0 && info.height > 0 && (info.width !== width || info.height !== height);
    return recorto ? data : original;
  } catch {
    return original;
  }
}
