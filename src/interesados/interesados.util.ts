import type { EtapaInteresado } from './interesado.entity';

/** Reglas puras de interesados (12/11/2026). */

export const ETAPAS_ACTIVAS: EtapaInteresado[] = ['nuevo', 'contactado', 'visita', 'negociando'];

export interface Busqueda {
  busca_marca?: string | null;
  busca_carroceria?: string | null;
  precio_max?: number | string | null;
  precio_moneda?: string | null;
}

export interface UnidadParaCruce {
  estado: string;
  marca: string;
  carroceria: string | null;
  moneda: string;
  precio_venta: number | string | null;
}

const igual = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** ¿Tiene algo cargado que se pueda cruzar contra el stock? */
export function tieneCriterio(b: Busqueda): boolean {
  return !!(b.busca_marca?.trim() || b.busca_carroceria?.trim() || Number(b.precio_max ?? 0) > 0);
}

/**
 * ¿Esta unidad le sirve a lo que busca? Sólo unidades disponibles y con precio.
 * El tope de precio se compara si está en la misma moneda que la unidad: sin
 * tipo de cambio a la vista, convertir sería inventar; en ese caso el tope no filtra.
 */
export function coincide(b: Busqueda, u: UnidadParaCruce): boolean {
  if (!tieneCriterio(b) || u.estado !== 'disponible' || u.precio_venta === null) return false;
  if (b.busca_marca?.trim() && !igual(b.busca_marca, u.marca)) return false;
  if (b.busca_carroceria?.trim() && !igual(b.busca_carroceria, u.carroceria)) return false;
  const tope = Number(b.precio_max ?? 0);
  if (tope > 0 && b.precio_moneda === u.moneda && Number(u.precio_venta) > tope) return false;
  return true;
}

/** Hay que hablarle y la fecha ya pasó (hoy cuenta como «toca hoy», no como atrasado). */
export function atrasado(etapa: EtapaInteresado, proxima: string | null | undefined, hoy: string): boolean {
  return ETAPAS_ACTIVAS.includes(etapa) && !!proxima && proxima < hoy;
}

export function tocaHoy(etapa: EtapaInteresado, proxima: string | null | undefined, hoy: string): boolean {
  return ETAPAS_ACTIVAS.includes(etapa) && proxima === hoy;
}

/** Sólo dígitos, para reconocer al mismo teléfono escrito de dos maneras. */
export function digitos(telefono: string | null | undefined): string {
  const d = (telefono ?? '').replace(/\D/g, '');
  // Los últimos 10 son el número nacional: así «+54 9 11 5555-0100» y «11 5555 0100» son el mismo.
  return d.length > 10 ? d.slice(-10) : d;
}

/** null si se puede pasar a esa etapa; si no, el motivo. */
export function problemaDelCambio(actual: EtapaInteresado, nueva: EtapaInteresado, motivo: string | null | undefined): string | null {
  if (actual === nueva) return 'Ya está en esa etapa.';
  if (actual === 'ganado') return 'Ya compró: no se mueve de etapa.';
  if (nueva === 'perdido' && !(motivo ?? '').trim()) return 'Decí por qué se perdió: sirve para saber qué falla.';
  return null;
}

/** Lee el auto que el sitio manda como texto JSON; cualquier cosa rara se descarta entera. */
export function usadoDe(texto: string | null | undefined): { marca: string; modelo: string; version: string | null; anio: number; km: number | null; combustible: string | null; transmision: string | null } | null {
  if (!texto) return null;
  let d: Record<string, unknown>;
  try { d = JSON.parse(texto) as Record<string, unknown>; } catch { return null; }
  if (!d || typeof d !== 'object') return null;
  const palabra = (v: unknown, largo: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, largo) : null);
  const marca = palabra(d.marca, 40);
  const modelo = palabra(d.modelo, 60);
  const anio = Number(d.anio);
  if (!marca || !modelo || !Number.isInteger(anio) || anio < 1900 || anio > 2100) return null;
  const km = Number(d.km);
  const elegido = (v: unknown, validos: string[]) => (typeof v === 'string' && validos.includes(v) ? v : null);
  return {
    marca, modelo, version: palabra(d.version, 60), anio,
    km: Number.isInteger(km) && km >= 0 && km < 10_000_000 ? km : null,
    combustible: elegido(d.combustible, ['nafta', 'diesel', 'gnc', 'hibrido', 'electrico']),
    transmision: elegido(d.transmision, ['manual', 'automatica']),
  };
}
