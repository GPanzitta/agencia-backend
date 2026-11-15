import { EntityManager, SelectQueryBuilder } from 'typeorm';

/**
 * Correlativos con prefijo: `VTA-2026-0001`, `GST-2026-0001`, `T-2026-08-30-001`.
 *
 * Había tres implementaciones del correlativo de órdenes —`sales.service`,
 * `web-store.service` y `salon.service`— y las tres compartían dos problemas:
 *
 * 1. **Orden alfabético.** Buscaban el último con `ORDER BY numero_venta DESC`.
 *    Como texto, `'OR-2026-9999' > 'OR-2026-10000'`: a partir de la orden
 *    10.000 el "último" pasa a ser el 9999 para siempre, y todas las órdenes
 *    siguientes intentan reusar el 10.000. Con el índice único de la entidad
 *    eso es un error en cada alta: el sistema deja de dar de alta.
 *
 * 2. **Carrera.** Leer el último y escribir el siguiente en pasos separados
 *    hace que dos altas simultáneas saquen el mismo número. El índice único
 *    evita el dato duplicado, pero a costa de tirar abajo una de las dos
 *    ventas en plena hora pico.
 *
 * Acá se resuelven los dos: `ordenPorCorrelativo` ordena por longitud y
 * después alfabéticamente (con relleno de ceros, eso es orden numérico real),
 * y `bloquearNumeracion` serializa a los que compiten por el mismo prefijo.
 */

/** Sufijo numérico de un correlativo. `VTA-2026-0007` → 7. */
export function numeroDeCorrelativo(valor: string, prefijo: string): number {
  const n = parseInt(valor.slice(prefijo.length), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * El correlativo que sigue al último encontrado. Sin último, arranca en 1.
 *
 * `ancho` es el relleno mínimo de ceros; pasado ese punto el número crece de
 * largo (0001…9999, 10000) en vez de truncarse.
 */
export function siguienteCorrelativo(
  prefijo: string,
  ultimo?: string | null,
  ancho = 4,
): string {
  const siguiente = ultimo ? numeroDeCorrelativo(ultimo, prefijo) + 1 : 1;
  return `${prefijo}${String(siguiente).padStart(ancho, '0')}`;
}

/**
 * Ordena un QueryBuilder para que el primer resultado sea el correlativo más
 * alto de verdad.
 *
 * Con ceros a la izquierda, "más largo" ya significa "más grande", y a igual
 * largo el orden alfabético coincide con el numérico. Ordenar solo por texto
 * —lo que hacían los tres call sites— pone `OR-2026-9999` por encima de
 * `OR-2026-10000`.
 */
export function ordenarPorCorrelativo<T extends object>(
  qb: SelectQueryBuilder<T>,
  columna: string,
): SelectQueryBuilder<T> {
  return qb.orderBy(`LENGTH(${columna})`, 'DESC').addOrderBy(columna, 'DESC');
}

/**
 * Serializa la generación de correlativos que comparten prefijo.
 *
 * `pg_advisory_xact_lock` toma un lock a nivel de transacción: el segundo que
 * llega espera y lo suelta solo el commit o el rollback, sin nada que liberar
 * a mano ni riesgo de dejarlo colgado si algo explota en el medio. Es un lock
 * sobre un número arbitrario, no sobre filas, así que no bloquea lecturas ni
 * frena nada más que a otra alta del mismo tipo de comprobante.
 *
 * Tiene que llamarse DENTRO de la transacción que va a insertar, y con el
 * manager de esa transacción — con otro manager el lock se toma y se suelta
 * en una transacción distinta, que es lo mismo que no tomarlo.
 */
export async function bloquearNumeracion(
  em: EntityManager,
  clave: string,
): Promise<void> {
  await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [clave]);
}
