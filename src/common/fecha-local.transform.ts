import { Transform } from 'class-transformer';

/**
 * Parsea un `YYYY-MM-DD` como medianoche LOCAL, no UTC.
 *
 * El bug que corta: `@Type(() => Date)` convierte "2026-08-24" en
 * `2026-08-24T00:00Z`, que en UTC-3 es las 21:00 del día 23. Cuando ese Date
 * se guarda en una columna `date`, el driver de Postgres toma la fecha LOCAL
 * y persiste **2026-08-23**: todo lo que se carga con fecha se guarda corrido
 * un día para atrás.
 *
 * Parseado como medianoche local, la fecha local del Date es la que el
 * usuario escribió, y eso es lo que se persiste.
 *
 * Si el valor trae hora (un ISO completo), se respeta tal cual.
 */
export function FechaLocal() {
  return Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return value;
    if (value instanceof Date) return value;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      const [anio, mes, dia] = value.trim().split('-').map(Number);
      return new Date(anio, mes - 1, dia);
    }
    return new Date(value);
  });
}
