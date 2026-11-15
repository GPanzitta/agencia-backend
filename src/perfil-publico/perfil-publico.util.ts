import {
  ACENTOS, Acento, Cifras, FotoTrabajo, Horario, ICONOS_SERVICIO, PerfilPublico, Redes, Servicio,
  VideoYoutube,
} from './entities/perfil-publico.entity';
import { Company } from '../companies/entities/company.entity';
import { whatsappArgentino } from '../common/whatsapp.util';
import { sintomasVigentes } from './sintomas.util';
import {
  ClaveFotoSitio, FotoSitioResuelta, VideoPortadaResuelto, resolverFotosSitio, resolverVideoPortada,
  resolverVideoTaller,
} from './fotos-sitio';

export { ACENTOS, ICONOS_SERVICIO };

export const TOPES = {
  eslogan: 120, quienes_somos: 2000, zona: 160, horarios: 7, marcas: 30, marca: 40,
  servicios: 8, fotos_trabajos: 12, pie: 120, frase: 160, nombre_servicio: 60,
  videos: 6, titulo_video: 80, url_video: 300, place_id: 300, instalacion_texto: 200,
} as const;

/** Los campos que el ERP edita: la entidad sin id, empresa ni fechas. */
export type PerfilEditable = Pick<
  PerfilPublico,
  | 'eslogan' | 'quienes_somos' | 'zona' | 'color_acento' | 'logo_url' | 'isotipo_url' | 'portada_url'
  | 'foto_equipo_url' | 'horarios' | 'redes' | 'marcas' | 'servicios' | 'fotos_trabajos' | 'cifras'
  | 'video_url' | 'video_poster_url' | 'videos' | 'google_place_id' | 'sintomas'
  | 'fotos_sitio' | 'video_portada_url' | 'instalacion_activa' | 'instalacion_texto' | 'vende_repuestos'
>;

/** Un video como lo ve el portal: el título ya resuelto y sin el personalizado. */
export interface VideoPublico {
  id: string;
  titulo: string;
  canal: string;
}

/**
 * `google_place_id` se excluye a nivel de TIPOS y no sólo por olvido en el
 * armador: es la credencial con la que se consulta Places, y si mañana alguien
 * hace un spread del perfil editable en la respuesta pública, TypeScript lo
 * frena acá.
 */
export interface PerfilPublicoRespuesta
  extends Omit<PerfilEditable, 'cifras' | 'videos' | 'google_place_id' | 'sintomas' | 'fotos_sitio' | 'video_portada_url'> {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  whatsapp: string | null;
  lat: number | null;
  lng: number | null;
  garantia_dias: number;
  cifras: Omit<Cifras, 'garantia_dias'>;
  videos: VideoPublico[];
  /** Cada lugar de la portada ya resuelto: la propia o la original (spec 2026-10-18). */
  fotos_sitio: Record<ClaveFotoSitio, FotoSitioResuelta[]>;
  video_portada: VideoPortadaResuelto;
  video_taller: { url: string; poster: string };
}

/** Sin fila cargada el ERP y el portal ven esto: nunca un 404 ni un hueco. */
export function perfilPorDefecto(): PerfilEditable {
  return {
    eslogan: null, quienes_somos: null, zona: null, color_acento: 'amarillo',
    logo_url: null, isotipo_url: null, portada_url: null, foto_equipo_url: null,
    horarios: [], redes: {}, marcas: [], servicios: [], fotos_trabajos: [], cifras: {},
    video_url: null, video_poster_url: null, videos: [], google_place_id: null,
    sintomas: sintomasVigentes(null), fotos_sitio: {}, video_portada_url: null,
    instalacion_activa: false, instalacion_texto: null, vende_repuestos: true,
  };
}

function numeroONulo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Los videos como los muestra el sitio (S1c-b §3.1): el título que se lee es
 * el que cargó el taller y, si no cargó ninguno, el que trajo `oembed`. El
 * `titulo_personalizado` no viaja: para el portal hay un solo título.
 */
export function videosPublicos(videos: VideoYoutube[] | null | undefined): VideoPublico[] {
  return (videos ?? []).map((v) => ({
    id: v.id,
    titulo: (v.titulo_personalizado ?? '').trim() || v.titulo,
    canal: v.canal,
  }));
}

/**
 * La respuesta de `GET /tienda/perfil`: perfil + lo público de la empresa,
 * en una sola llamada. `garantia_dias` de `cifras` es sólo un override del
 * de la empresa, y sale una sola vez, arriba.
 */
export function armarPerfilPublico(company: Company, perfil: PerfilEditable | null): PerfilPublicoRespuesta {
  const p = perfil ?? perfilPorDefecto();
  const { garantia_dias: garantiaOverride, ...cifras } = p.cifras ?? {};
  const telefono = company.telefono ?? null;
  return {
    nombre: company.name,
    direccion: company.direccion ?? null,
    telefono,
    whatsapp: whatsappArgentino(telefono),
    lat: numeroONulo(company.lat),
    lng: numeroONulo(company.lng),
    garantia_dias: garantiaOverride ?? company.garantia_dias ?? 90,
    eslogan: p.eslogan ?? null,
    quienes_somos: p.quienes_somos ?? null,
    zona: p.zona ?? null,
    color_acento: (ACENTOS as readonly string[]).includes(p.color_acento) ? p.color_acento : 'amarillo',
    logo_url: p.logo_url ?? null,
    isotipo_url: p.isotipo_url ?? null,
    portada_url: p.portada_url ?? null,
    foto_equipo_url: p.foto_equipo_url ?? null,
    horarios: p.horarios ?? [],
    redes: p.redes ?? {},
    marcas: p.marcas ?? [],
    servicios: p.servicios ?? [],
    fotos_trabajos: p.fotos_trabajos ?? [],
    cifras,
    video_url: p.video_url ?? null,
    video_poster_url: p.video_poster_url ?? null,
    videos: videosPublicos(p.videos),
    fotos_sitio: resolverFotosSitio(p.fotos_sitio),
    video_portada: resolverVideoPortada(p.video_portada_url),
    // Una fila de antes de la columna (o con algo raro) sale apagada.
    instalacion_activa: p.instalacion_activa === true,
    instalacion_texto: p.instalacion_texto?.trim() || null,
    // Sólo un `false` guardado lo apaga: una fila de antes de la columna vende como siempre.
    vende_repuestos: p.vende_repuestos !== false,
    video_taller: resolverVideoTaller({
      video_url: p.video_url ?? null, video_poster_url: p.video_poster_url ?? null, portada_url: p.portada_url ?? null,
    }),
  };
}

/** Sólo imágenes del almacén propio: disco local (`/uploads/…`) o Cloudinary. */
export function esUrlPropia(url: string): boolean {
  if (typeof url !== 'string' || !url) return false;
  return url.startsWith('/uploads/') || url.startsWith('https://res.cloudinary.com/');
}

export type { Acento, Horario, Redes, Servicio, FotoTrabajo, Cifras, VideoYoutube };
