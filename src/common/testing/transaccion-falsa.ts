/**
 * Transacción de mentira para los specs unitarios: prueba que una operación
 * de varias escrituras es «todo o nada» sin levantar una base.
 *
 * - `transaction(fn)` corre `fn` con el `em` que arma el test. Las escrituras
 *   que ese `em` anota quedan pendientes y sólo pasan a `confirmadas` si `fn`
 *   termina bien. Si `fn` tira, se descartan (el ROLLBACK de Postgres).
 * - `directa(...)` anota una escritura hecha FUERA de la transacción (con un
 *   repositorio inyectado): esa queda confirmada en el acto, como en la base
 *   real. Si el código escribe por afuera, el test lo ve en `confirmadas`
 *   aunque la operación falle.
 *
 * Uso típico: después de forzar el error de un paso del medio,
 * `expect(base.confirmadas).toEqual([])`.
 */
export function transaccionFalsa<E>(armarEm: (anotar: (escritura: string) => void) => E) {
  const confirmadas: string[] = [];
  let abiertas = 0;
  const transaction = async (...args: unknown[]) => {
    abiertas++;
    // Acepta transaction(fn) y transaction(nivelDeAislamiento, fn).
    const fn = args[args.length - 1] as (em: E) => Promise<unknown>;
    const pendientes: string[] = [];
    const resultado = await fn(armarEm((e) => pendientes.push(e)));
    confirmadas.push(...pendientes);
    return resultado;
  };
  const directa = (escritura: string) => confirmadas.push(escritura);
  return { confirmadas, transaction, directa, abiertas: () => abiertas };
}
