/**
 * Funciones puras del almacén en Cloudinary (`fotos.almacen.cloudinary.ts`),
 * separadas para probarlas sin el SDK.
 */

export type RecursoCloudinary = 'image' | 'raw' | 'video';

/**
 * Cloudinary se configura con la variable estándar del SDK,
 * `CLOUDINARY_URL=cloudinary://key:secret@cloud`. Si falta, el backend sigue
 * guardando en el disco local (dev). Cualquier otro formato se rechaza para no
 * arrancar con una config que el SDK no va a entender.
 */
export function hayCloudinary(env: { CLOUDINARY_URL?: string }): boolean {
  return (env.CLOUDINARY_URL ?? '').trim().startsWith('cloudinary://');
}

/**
 * Carpeta final dentro de la cuenta: `<prefijo>/<subcarpeta>`. El prefijo
 * (`CLOUDINARY_CARPETA`) permite que una misma cuenta sirva a varios
 * despliegues (demo, cliente A, cliente B) sin que se mezclen los archivos.
 */
export function carpetaCloudinary(prefijo: string | undefined, subcarpeta: string): string {
  const limpiar = (s: string) => s.replace(/^\/+|\/+$/g, '');
  return [limpiar(prefijo ?? ''), limpiar(subcarpeta)].filter(Boolean).join('/');
}

const URL_ENTREGA = /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw|video)\/upload\/(?:v\d+\/)?(.+)$/;

/**
 * Lo que hace falta para borrar un archivo a partir de la URL que guardamos
 * en la base. Sólo entiende URLs de entrega de Cloudinary: las `/uploads/`
 * viejas del disco (o cualquier otra) dan `null` y no se tocan. En `raw` el
 * public_id lleva extensión (Cloudinary lo guarda así); en `image` y
 * `video`, no.
 */
export function publicIdDeUrl(url: string): { publicId: string; resourceType: RecursoCloudinary } | null {
  const m = URL_ENTREGA.exec(url ?? '');
  if (!m) return null;
  const resourceType = m[1] as RecursoCloudinary;
  const ruta = m[2].split('?')[0];
  const publicId = resourceType === 'raw' ? ruta : ruta.replace(/\.[a-z0-9]+$/i, '');
  return { publicId, resourceType };
}

/**
 * Patrón para validar en un DTO que una URL es "una subida nuestra" de esa
 * subcarpeta y no una URL ajena: la ruta del disco local (`/uploads/<sub>/x`)
 * o la URL de entrega de Cloudinary (`https://res.cloudinary.com/<cloud>/image/
 * upload/[vN/][<prefijo>/]<sub>/x`). El prefijo (`CLOUDINARY_CARPETA`) varía
 * por despliegue, por eso se acepta cualquiera.
 */
export function patronDeSubida(subcarpeta: string): RegExp {
  const archivo = String.raw`[\w.-]+`;
  const disco = `/uploads/${subcarpeta}/${archivo}`;
  const cloudinary = String.raw`https://res\.cloudinary\.com/[^/]+/image/upload/(?:v\d+/)?(?:[\w./-]+/)?` + `${subcarpeta}/${archivo}`;
  return new RegExp(`^(?:${disco}|${cloudinary})$`);
}

const VIDEO_ENTREGA = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.+)$/;

/**
 * El poster de un video subido a Cloudinary (S1c-b §3.1): la misma URL con
 * `so_0/` (segundo cero) insertado tras `/upload/` y extensión `.jpg`.
 * Cloudinary lo genera al vuelo la primera vez que alguien lo pide, así que no
 * hay una segunda subida ni un segundo archivo que borrar.
 *
 * Devuelve `null` para el almacén local: en desarrollo no hay quien saque el
 * primer cuadro, y el portal usa la portada como respaldo.
 */
export function posterDeCloudinary(url: string): string | null {
  const m = VIDEO_ENTREGA.exec(url ?? '');
  if (!m) return null;
  const resto = m[2].split('?')[0].replace(/\.[a-z0-9]+$/i, '');
  return `${m[1]}so_0/${resto}.jpg`;
}
