/**
 * La publicación de un auto (14/11/2026): lo que el sitio muestra además de los
 * datos básicos. Puro: acá se limpia lo que manda el ERP antes de guardarlo.
 */
export interface Publicacion {
  destacados: { nombre: string; categoria: string }[];
  caracteristicas: { grupo: string; etiqueta: string; valor: string }[];
  colores: { nombre: string; hex: string }[];
  /** El precio si lo financia con la agencia; null = no se ofrece. */
  precio_financiado: number | null;
  /** Mostrar la opción «Entregá tu usado en parte de pago». */
  mostrar_toma: boolean;
  /** Otros autos que se ofrecen al lado; vacío = los elige el sitio. */
  relacionadas: string[];
}

export const PUBLICACION_VACIA: Publicacion = { destacados: [], caracteristicas: [], colores: [], precio_financiado: null, mostrar_toma: true, relacionadas: [] };
export const TOPES_PUBLICACION = { destacados: 12, caracteristicas: 60, colores: 8, relacionadas: 6, texto: 60 };

const T = TOPES_PUBLICACION;
const texto = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, T.texto) : '');
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : []);
const unicos = <X>(l: X[], clave: (x: X) => string) => [...new Map(l.map((x) => [clave(x).toLowerCase(), x])).values()];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Deja la publicación en su forma: sin renglones vacíos ni repetidos, sin HTML y dentro de los topes. */
export function normalizarPublicacion(crudo: unknown): Publicacion {
  const p = (typeof crudo === 'object' && crudo !== null ? crudo : {}) as Record<string, unknown>;
  const precio = Number(p['precio_financiado']);
  return {
    destacados: unicos(lista(p['destacados']).map((d) => ({ nombre: texto(d['nombre']), categoria: texto(d['categoria']) || 'Confort' })).filter((d) => d.nombre), (d) => d.nombre).slice(0, T.destacados),
    caracteristicas: unicos(
      lista(p['caracteristicas']).map((c) => ({ grupo: texto(c['grupo']) || 'General', etiqueta: texto(c['etiqueta']), valor: texto(c['valor']) })).filter((c) => c.etiqueta && c.valor),
      (c) => `${c.grupo}|${c.etiqueta}`,
    ).slice(0, T.caracteristicas),
    colores: unicos(
      lista(p['colores']).map((c) => ({ nombre: texto(c['nombre']), hex: /^#[0-9a-f]{6}$/i.test(String(c['hex'])) ? String(c['hex']).toLowerCase() : '#888888' })).filter((c) => c.nombre),
      (c) => c.nombre,
    ).slice(0, T.colores),
    precio_financiado: Number.isFinite(precio) && precio > 0 && precio < 1e12 ? Math.round(precio * 100) / 100 : null,
    mostrar_toma: p['mostrar_toma'] !== false,
    relacionadas: [...new Set((Array.isArray(p['relacionadas']) ? p['relacionadas'] : []).filter((x): x is string => typeof x === 'string' && UUID.test(x)))].slice(0, T.relacionadas),
  };
}
