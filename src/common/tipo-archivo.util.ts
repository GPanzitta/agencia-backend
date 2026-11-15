/**
 * El tipo de un archivo por sus primeros bytes, no por la extensión ni por el
 * mimetype que declara el navegador (que lo escribe quien sube).
 *
 * SEG-09 (auditoría de seguridad 13/10/2026): los endpoints públicos ya
 * miraban los bytes (`formatoDeFoto`, que vivía en solicitudes-servicio); las
 * subidas autenticadas confiaban en el mimetype y le pasaban a `sharp`
 * cualquier cosa, o guardaban un archivo con la extensión que dijera el
 * navegador. Ahora todas pasan por acá.
 */

export type FormatoFoto = 'jpg' | 'png' | 'webp' | 'heic';
export type FormatoArchivo = FormatoFoto | 'gif' | 'pdf';
export type FormatoVideo = 'mp4' | 'webm';

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MARCAS_HEIF = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'];
const FIRMA_WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

/** Una foto que `sharp` sabe leer: jpg, png, webp o heic. */
export function formatoDeFoto(b: Buffer | null | undefined): FormatoFoto | null {
  if (!b || b.length < 4) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 8 && b.subarray(0, 8).equals(FIRMA_PNG)) return 'png';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'webp';
  }
  if (b.length >= 12 && b.subarray(4, 8).toString('latin1') === 'ftyp' && MARCAS_HEIF.includes(b.subarray(8, 12).toString('latin1'))) {
    return 'heic';
  }
  return null;
}

/** Comprobantes y remitos: una foto, un gif o un pdf. */
export function formatoDeArchivo(b: Buffer | null | undefined): FormatoArchivo | null {
  const foto = formatoDeFoto(b);
  if (foto) return foto;
  if (!b || b.length < 5) return null;
  if (b.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  return null;
}

/** El video del sitio: mp4 (caja `ftyp` que no sea HEIF) o webm (cabecera EBML). */
export function formatoDeVideo(b: Buffer | null | undefined): FormatoVideo | null {
  if (!b || b.length < 12) return null;
  if (b.subarray(0, 4).equals(FIRMA_WEBM)) return 'webm';
  if (b.subarray(4, 8).toString('latin1') === 'ftyp' && !MARCAS_HEIF.includes(b.subarray(8, 12).toString('latin1'))) return 'mp4';
  return null;
}
