import { UnidadAjena } from './lector.util';

/**
 * La historia de cada aviso de otro vendedor (14/11/2026): cuándo apareció, cada cambio de precio
 * y cuándo dejó de estar. Puro: recibe lo que había y lo que se leyó, devuelve cómo queda.
 */
export interface PuntoDePrecio { fecha: string; precio: number }
export interface AvisoGuardado {
  clave: string; titulo: string; marca: string | null; anio: number | null; km: number | null; detalle: string | null; url: string | null;
  moneda: 'ARS' | 'USD'; precio: number; precio_anterior: number | null; cambio_at: Date | null; historia: PuntoDePrecio[];
  primera_vez_at: Date; ultima_vez_at: Date; activo: boolean; desaparecio_at: Date | null;
}

/** Lo que identifica a un aviso entre una lectura y la siguiente: su dirección o, si no tiene, sus datos. */
export const claveDe = (u: UnidadAjena): string => (u.url ?? [u.titulo, u.anio, u.km, u.detalle ?? ''].join('|')).slice(0, 500);

const MAXIMO_PUNTOS = 60;

/**
 * Cómo queda cada aviso después de una lectura. Los que no aparecieron dejan de estar activos
 * (sólo si la lectura trajo algo: una lectura vacía es una falla, no un vendedor que vendió todo).
 */
export function aplicarLectura(previos: AvisoGuardado[], leidos: UnidadAjena[], ahora: Date): AvisoGuardado[] {
  if (!leidos.length) return previos;
  const fecha = ahora.toISOString();
  const porClave = new Map(previos.map((p) => [p.clave, p]));
  const vistos = new Set<string>();
  const salida: AvisoGuardado[] = [];
  for (const u of leidos) {
    const clave = claveDe(u);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const p = porClave.get(clave);
    const datos = { clave, titulo: u.titulo, marca: u.marca, anio: u.anio, km: u.km, detalle: u.detalle ?? null, url: u.url, moneda: u.moneda };
    if (!p) {
      salida.push({ ...datos, precio: u.precio, precio_anterior: null, cambio_at: null, historia: [{ fecha, precio: u.precio }], primera_vez_at: ahora, ultima_vez_at: ahora, activo: true, desaparecio_at: null });
      continue;
    }
    // Un cambio de moneda no es una baja ni una suba: se toma como precio nuevo, sin comparar.
    const cambio = p.precio !== u.precio && p.moneda === u.moneda;
    salida.push({
      ...p, ...datos, precio: u.precio,
      precio_anterior: cambio ? p.precio : p.precio_anterior,
      cambio_at: cambio ? ahora : p.cambio_at,
      historia: p.precio !== u.precio ? [...p.historia, { fecha, precio: u.precio }].slice(-MAXIMO_PUNTOS) : p.historia,
      ultima_vez_at: ahora, activo: true, desaparecio_at: null,
    });
  }
  for (const p of previos) {
    if (!vistos.has(p.clave)) salida.push(p.activo ? { ...p, activo: false, desaparecio_at: ahora } : p);
  }
  return salida;
}

const DIA = 86_400_000;
export const diasEntre = (desde: Date, hasta: Date): number => Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / DIA));

export interface Novedad {
  tipo: 'bajo' | 'subio' | 'nuevo' | 'salio';
  titulo: string; anio: number | null; km: number | null; detalle: string | null; url: string | null; moneda: 'ARS' | 'USD';
  precio: number; precio_anterior: number | null;
  /** Para una baja o una suba: cuánto, en %. */
  variacion_pct: number | null;
  /** Para uno que salió: cuántos días estuvo publicado desde que lo vimos. */
  dias_publicado: number | null;
  fecha: Date;
}

/** Lo que cambió desde una fecha: bajas y subas de precio, avisos nuevos y los que dejaron de estar. Lo más reciente primero. */
export function novedadesDesde(avisos: AvisoGuardado[], desde: Date): Novedad[] {
  const salida: Novedad[] = [];
  for (const a of avisos) {
    const comun = { titulo: a.titulo, anio: a.anio, km: a.km, detalle: a.detalle, url: a.url, moneda: a.moneda, precio: a.precio };
    if (!a.activo) {
      if (a.desaparecio_at && a.desaparecio_at >= desde) salida.push({ ...comun, tipo: 'salio', precio_anterior: null, variacion_pct: null, dias_publicado: diasEntre(a.primera_vez_at, a.desaparecio_at), fecha: a.desaparecio_at });
      continue;
    }
    if (a.cambio_at && a.cambio_at >= desde && a.precio_anterior !== null && a.precio_anterior > 0) {
      salida.push({ ...comun, tipo: a.precio < a.precio_anterior ? 'bajo' : 'subio', precio_anterior: a.precio_anterior, variacion_pct: Math.round(((a.precio - a.precio_anterior) / a.precio_anterior) * 1000) / 10, dias_publicado: null, fecha: a.cambio_at });
    } else if (a.primera_vez_at >= desde) {
      salida.push({ ...comun, tipo: 'nuevo', precio_anterior: null, variacion_pct: null, dias_publicado: null, fecha: a.primera_vez_at });
    }
  }
  return salida.sort((x, y) => y.fecha.getTime() - x.fecha.getTime());
}

/** El precio que tenía publicado en una fecha; null si todavía no lo habíamos visto o ya no estaba. */
export function precioAl(a: AvisoGuardado, fecha: Date): number | null {
  if (a.primera_vez_at > fecha || (a.desaparecio_at && a.desaparecio_at <= fecha)) return null;
  let precio: number | null = null;
  for (const p of a.historia) { if (new Date(p.fecha) <= fecha) precio = p.precio; else break; }
  return precio;
}
