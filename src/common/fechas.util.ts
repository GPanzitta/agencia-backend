/**
 * Interpretación de rangos de fecha que llegan por query string.
 *
 * El problema que resuelve: `new Date('2026-08-24')` es medianoche UTC. Si eso
 * se usa como límite superior de un rango, el reporte de "hasta hoy" excluye
 * todo lo que pasó hoy — y en un restaurante lo que se excluye es justamente
 * el servicio de la noche.
 *
 * Un `YYYY-MM-DD` suelto es una fecha del calendario del local, no un instante
 * UTC. Acá se convierte al instante que corresponde según el huso del negocio.
 *
 * El huso se toma de `TZ_OFFSET_HORAS` (por defecto -3, Argentina). Es un
 * offset fijo a propósito: el país no aplica horario de verano desde 2009, y
 * un offset fijo es verificable de un vistazo. Si algún día hace falta soportar
 * DST o varios locales en husos distintos, esto se reemplaza por una zona IANA
 * real, no se parchea.
 */

const OFFSET_HORAS = Number(process.env.TZ_OFFSET_HORAS ?? -3);

/** `true` si el string es una fecha de calendario sin hora (`YYYY-MM-DD`). */
const esFechaSuelta = (valor: string) => /^\d{4}-\d{2}-\d{2}$/.test(valor.trim());

/**
 * Comienzo del día del local. `2026-08-24` con offset -3 → `2026-08-24T03:00Z`.
 * Si el valor ya trae hora, se respeta tal cual vino.
 */
export function inicioDeDia(valor?: string, porDefecto?: Date): Date | undefined {
  if (!valor) return porDefecto;
  if (!esFechaSuelta(valor)) return new Date(valor);

  const [anio, mes, dia] = valor.trim().split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia, -OFFSET_HORAS, 0, 0, 0));
}

/**
 * Último instante del día del local, inclusive.
 * `2026-08-24` con offset -3 → `2026-08-25T02:59:59.999Z`.
 *
 * Que sea inclusive es la parte importante: quien filtra "hasta el 24" espera
 * que el 24 entre en el resultado.
 */
export function finDeDia(valor?: string, porDefecto?: Date): Date | undefined {
  if (!valor) return porDefecto;
  if (!esFechaSuelta(valor)) return new Date(valor);

  const [anio, mes, dia] = valor.trim().split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia, 23 - OFFSET_HORAS, 59, 59, 999));
}

/**
 * La fecha de calendario del taller para un instante dado (`YYYY-MM-DD`).
 *
 * `new Date().toISOString().slice(0, 10)` da la fecha UTC, que con offset −3 ya
 * es la de mañana a partir de las 21:00. Eso hacía que, pasada esa hora, "hoy"
 * fuera otro día: el chofer que seguía en la calle perdía su ruta de la
 * pantalla, la agenda del día quedaba vacía y un turno de caja abierto a la
 * noche se etiquetaba con la fecha siguiente.
 */
export function fechaLocal(momento: Date = new Date()): string {
  const local = new Date(momento.getTime() + OFFSET_HORAS * 3_600_000);
  return local.toISOString().slice(0, 10);
}

/**
 * La hora de reloj del taller para un instante dado (`HH:MM`).
 *
 * `getHours()` devuelve la hora del proceso, que en Render es UTC: un
 * vencimiento a las 18:00 del taller se le prometía al cliente como las
 * 21:00. Mismo desplazamiento que `fechaLocal`, y se lee del ISO para no
 * depender del huso de la máquina.
 */
export function horaLocal(momento: Date): string {
  const local = new Date(momento.getTime() + OFFSET_HORAS * 3_600_000);
  return local.toISOString().slice(11, 16);
}

/**
 * El rango UTC que cubre un día del calendario del taller.
 *
 * Sirve para contar o filtrar "lo de hoy" sin depender de en qué huso
 * interprete la base un `DATE(columna)`.
 */
export function rangoDelDiaLocal(fecha: string): { desde: Date; hasta: Date } {
  return { desde: inicioDeDia(fecha) as Date, hasta: finDeDia(fecha) as Date };
}

/** Primer instante del mes en curso, en hora del local. */
export function inicioDelMesActual(): Date {
  const ahora = new Date();
  const local = new Date(ahora.getTime() + OFFSET_HORAS * 3_600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, -OFFSET_HORAS, 0, 0, 0));
}
