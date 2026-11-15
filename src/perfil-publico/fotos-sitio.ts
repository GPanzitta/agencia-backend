/**
 * Las fotos del sitio que el taller cambia desde el ERP (spec 2026-10-18).
 *
 * El backend es el dueño del catálogo: cada lugar de la portada con su
 * sección, su título para el ERP y las fotos originales de Pexels que se ven
 * mientras el taller no suba la suya. Las propias se guardan en
 * `perfil_publico.fotos_sitio` (clave → lista por posición, `null` = original)
 * y todo sale ya resuelto: el portal nunca arma una URL de Pexels.
 */

const PEXELS = {
  tecnico: 31718639,
  aire: 5463580,
  lavarropas: 5591460,
  herramientas: 14534738,
  camioneta: 6169582,
  deposito: 29454379,
  estanterias: 12234109,
} as const;

export type FotoPexels = keyof typeof PEXELS;

export const VIDEOS_ORIGINALES = {
  /** El taller trabajando: el cuadro grande de la portada. */
  portada: 'https://videos.pexels.com/video-files/6755167/6755167-hd_1280_720_25fps.mp4',
  /** El banco de trabajo: «El taller por dentro», si el perfil no tiene video propio. */
  taller: 'https://videos.pexels.com/video-files/6755154/6755154-hd_1280_720_25fps.mp4',
} as const;

interface Lugar {
  seccion: string;
  titulo: string;
  /** Una por posición: la cantidad de fotos del lugar es su largo. */
  originales: FotoPexels[];
}

/** En el orden en que aparecen en la página: así los lista el ERP. */
export const LUGARES_FOTO = {
  portada_video_poster: { seccion: 'Portada', titulo: 'Póster del video grande', originales: ['tecnico'] },
  portada_visita: { seccion: 'Portada', titulo: 'Cuadro «Visita técnica» (rotan)', originales: ['camioneta', 'lavarropas'] },
  portada_tienda: { seccion: 'Portada', titulo: 'Cuadro de la tienda (sin ofertas con foto)', originales: ['herramientas'] },
  portada_repuestos: { seccion: 'Portada', titulo: 'Cuadro «Repuestos para retirar hoy» (rotan)', originales: ['deposito', 'estanterias'] },
  portada_aire: { seccion: 'Portada', titulo: 'Cuadro «Service de aire»', originales: ['aire'] },
  equipo_lavarropas: { seccion: '¿Qué le pasa a tu equipo?', titulo: 'Lavarropas', originales: ['lavarropas'] },
  equipo_aire: { seccion: '¿Qué le pasa a tu equipo?', titulo: 'Aire acondicionado', originales: ['aire'] },
  equipo_televisor: { seccion: '¿Qué le pasa a tu equipo?', titulo: 'Televisores y plaquetas', originales: ['tecnico'] },
  equipo_heladera: { seccion: '¿Qué le pasa a tu equipo?', titulo: 'Heladeras y microondas', originales: ['herramientas'] },
  seguimiento_ejemplo: { seccion: 'Seguí tu reparación', titulo: 'Foto de la orden de ejemplo', originales: ['tecnico'] },
  marcas: { seccion: 'Marcas', titulo: 'Fondos de los cuadros de marcas (se alternan)', originales: ['lavarropas', 'tecnico', 'herramientas', 'aire'] },
  taller_deposito: { seccion: 'El taller por dentro', titulo: 'Primera foto', originales: ['estanterias'] },
  taller_camioneta: { seccion: 'El taller por dentro', titulo: 'Segunda foto', originales: ['camioneta'] },
} satisfies Record<string, Lugar>;

export type ClaveFotoSitio = keyof typeof LUGARES_FOTO;

export const CLAVES_FOTO_SITIO = Object.keys(LUGARES_FOTO) as ClaveFotoSitio[];

/** Lo que se guarda por posición: la foto propia, o `null` si va la original. */
export interface FotoSitioGuardada {
  url: string;
  miniatura: string;
}

export type FotosSitioGuardadas = Partial<Record<ClaveFotoSitio, (FotoSitioGuardada | null)[]>>;

export interface FotoSitioResuelta {
  url: string;
  miniatura: string;
  propia: boolean;
}

export function esClaveFotoSitio(clave: string): clave is ClaveFotoSitio {
  return Object.prototype.hasOwnProperty.call(LUGARES_FOTO, clave);
}

/** La foto de Pexels a `ancho` píxeles (comprimida por ellos). */
export function fotoPexels(foto: FotoPexels, ancho: number): string {
  const id = PEXELS[foto];
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&w=${ancho}`;
}

/** La propia guardada en `posicion`, si es válida; si no, `null`. */
export function propiaEn(guardadas: unknown, clave: ClaveFotoSitio, posicion: number): FotoSitioGuardada | null {
  if (!guardadas || typeof guardadas !== 'object') return null;
  const lista = (guardadas as Record<string, unknown>)[clave];
  if (!Array.isArray(lista)) return null;
  const f = lista[posicion] as Partial<FotoSitioGuardada> | null | undefined;
  if (!f || typeof f.url !== 'string' || !f.url) return null;
  return { url: f.url, miniatura: typeof f.miniatura === 'string' && f.miniatura ? f.miniatura : f.url };
}

/**
 * Cada lugar del catálogo con todas sus posiciones. Lo que haya en la base
 * fuera del catálogo (claves viejas, posiciones de más, basura) se ignora:
 * la página nunca se rompe por un dato raro.
 */
export function resolverFotosSitio(guardadas: unknown): Record<ClaveFotoSitio, FotoSitioResuelta[]> {
  const salida = {} as Record<ClaveFotoSitio, FotoSitioResuelta[]>;
  for (const clave of CLAVES_FOTO_SITIO) {
    const originales: readonly FotoPexels[] = LUGARES_FOTO[clave].originales;
    salida[clave] = originales.map((original, i) => {
      const propia = propiaEn(guardadas, clave, i);
      return propia
        ? { ...propia, propia: true }
        : { url: fotoPexels(original, 1400), miniatura: fotoPexels(original, 700), propia: false };
    });
  }
  return salida;
}

export interface VideoPortadaResuelto {
  url: string;
  propio: boolean;
}

export function resolverVideoPortada(videoPortadaUrl: string | null | undefined): VideoPortadaResuelto {
  return videoPortadaUrl ? { url: videoPortadaUrl, propio: true } : { url: VIDEOS_ORIGINALES.portada, propio: false };
}

/** «El taller por dentro»: el video del perfil o el original, con el póster que corresponda. */
export function resolverVideoTaller(p: {
  video_url: string | null; video_poster_url: string | null; portada_url: string | null;
}): { url: string; poster: string } {
  return {
    url: p.video_url || VIDEOS_ORIGINALES.taller,
    poster: (p.video_url && (p.video_poster_url || p.portada_url)) || fotoPexels('tecnico', 1400),
  };
}

export interface FotosDelSitioErp {
  lugares: { clave: ClaveFotoSitio; seccion: string; titulo: string; fotos: FotoSitioResuelta[] }[];
  video_portada: VideoPortadaResuelto;
}

/** Lo que ve la pantalla «Fotos del sitio» del ERP. */
export function lugaresParaErp(guardadas: unknown, videoPortadaUrl: string | null | undefined): FotosDelSitioErp {
  const fotos = resolverFotosSitio(guardadas);
  return {
    lugares: CLAVES_FOTO_SITIO.map((clave) => ({
      clave, seccion: LUGARES_FOTO[clave].seccion, titulo: LUGARES_FOTO[clave].titulo, fotos: fotos[clave],
    })),
    video_portada: resolverVideoPortada(videoPortadaUrl),
  };
}
