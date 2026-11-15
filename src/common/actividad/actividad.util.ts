/**
 * Consumo de Neon (28/10/2026): la base se duerme a los 5 min sin consultas y
 * cada minuto despierta se cobra. Los cron que consultaban «por las dudas»
 * cada 1 y 5 min la tenían despierta las 24 h y agotaron la cuota del mes.
 * Desde ahí, el mantenimiento que no es urgente corre cuando la base ya está
 * despierta porque alguien la está usando, con un tope para que no se quede
 * sin correr si nadie entra.
 */

export const MINUTO_MS = 60_000;
export const HORA_MS = 60 * MINUTO_MS;

/** Neon suspende a los 5 min: con 4 de margen, un pedido más nuevo que esto asegura que la base está prendida. */
export const BASE_DESPIERTA_MS = 4 * MINUTO_MS;

export interface Mantenimiento {
  ahora: number;
  /** Cuándo corrió la tarea por última vez; `null` = desde que arrancó el proceso no corrió. */
  ultimaCorrida: number | null;
  /** El último pedido HTTP que llegó (sin contar el health check). */
  ultimaActividad: number | null;
  /** Cada cuánto conviene correrla mientras hay uso. */
  cadaMs: number;
  /** Pasado esto corre igual, aunque tenga que despertar la base. */
  topeMs: number;
}

export function baseDespierta(ahora: number, ultimaActividad: number | null): boolean {
  return ultimaActividad != null && ahora - ultimaActividad < BASE_DESPIERTA_MS;
}

/**
 * Al arrancar corre (la base está despierta: el arranque se conecta). Después,
 * cada `cadaMs` si la base está despierta, y sí o sí al llegar al tope.
 */
export function tocaMantenimiento(m: Mantenimiento): boolean {
  if (m.ultimaCorrida == null) return true;
  const desde = m.ahora - m.ultimaCorrida;
  if (desde >= m.topeMs) return true;
  return desde >= m.cadaMs && baseDespierta(m.ahora, m.ultimaActividad);
}
