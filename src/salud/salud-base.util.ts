import { MINUTO_MS, baseDespierta } from '../common/actividad/actividad.util';

/**
 * `/api/health/base` (spec 2026-10-28 §4): el monitor externo pregunta cada
 * 5 min si la base contesta. Si cada pregunta fuera un `SELECT 1`, la base de
 * Neon no se dormiría nunca y se agotaría la cuota (lo que pasó el 28/10).
 * Con la base dormida se contesta lo último que se supo, y se vuelve a
 * consultar a lo sumo una vez por hora.
 */
export type CodigoBase = 'BASE_SIN_CUOTA' | 'BASE_SIN_RESPUESTA' | 'BASE_CON_ERROR';

export const CACHE_BASE_DORMIDA_MS = 60 * MINUTO_MS;
export const TOPE_CONSULTA_MS = 3000;
/** Con la base dormida, Neon tiene que arrancarla y abrir conexión: 3 s darían falsas alarmas. */
export const TOPE_CONSULTA_DORMIDA_MS = 10_000;

export interface UltimaConsulta {
  en: number;
  ok: boolean;
}

export function tocaConsultarBase(o: { ahora: number; ultima: UltimaConsulta | null; ultimaActividad: number | null }): boolean {
  if (!o.ultima) return true;
  // Si falló, consultar no gasta: sin cuota o sin conexión no hay cómputo.
  if (!o.ultima.ok) return true;
  if (baseDespierta(o.ahora, o.ultimaActividad)) return true;
  return o.ahora - o.ultima.en >= CACHE_BASE_DORMIDA_MS;
}

export function codigoDeError(e: unknown): CodigoBase {
  const x = e as { code?: unknown; message?: unknown } | null;
  if (x?.code === '53000') return 'BASE_SIN_CUOTA';
  if (x?.message === 'TIMEOUT_BASE') return 'BASE_SIN_RESPUESTA';
  return 'BASE_CON_ERROR';
}
