/**
 * Reglas del video de portada (S1c-b §3.3). Puras: el controlador y el
 * servicio las usan, y el spec las prueba sin levantar nada.
 */

/** Los dos formatos que todos los navegadores reproducen en bucle sin plugins. */
export const MIMES_VIDEO = ['video/mp4', 'video/webm'] as const;

/**
 * 25 MB. Es un clip de 15 a 20 segundos a calidad razonable, y el techo de lo
 * que conviene subirle a Cloudinary por taller: los videos consumen mucho más
 * crédito que las fotos.
 */
export const TOPE_VIDEO_BYTES = 25 * 1024 * 1024;

export type ExtensionVideo = 'mp4' | 'webm';

/**
 * La extensión del archivo según lo que declaró el navegador. El mime puede
 * venir con parámetros (`video/webm; codecs=vp9`) y en cualquier caja.
 */
export function extensionDeVideo(mimetype: string): ExtensionVideo | null {
  const base = (mimetype ?? '').split(';')[0].trim().toLowerCase();
  if (base === 'video/mp4') return 'mp4';
  if (base === 'video/webm') return 'webm';
  return null;
}
