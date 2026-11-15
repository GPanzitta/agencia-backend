// SOPORTE DE MIGRACIONES: el módulo ya no existe; este archivo queda sólo porque una migración del historial lo importa.
/**
 * La única regla de normalización del módulo (spec §2.1).
 *
 * Es una función pura y no una función de Postgres a propósito: `unaccent` es
 * una extensión que hay que instalar en la base gestionada, `to_tsvector` trae
 * stemming de un idioma que no tiene nada que decir sobre "B32332-450V", y
 * ninguna de las dos se puede testear con Jest sin base. El precedente es
 * `compatibilidad.util.ts`, que por eso mismo tiene reglas legibles y tests.
 *
 * La copia idéntica de este archivo va al ERP en C5b, anotada como copia.
 */
export function normalizarTexto(valor: string | null | undefined): string {
  return String(valor ?? '')
    .normalize('NFD')
    // Bloque "Combining Diacritical Marks": es lo que NFD separó de la letra.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * La identidad de un código. `CAP-30`, `cap 30` y `CAP30` son el mismo código
 * y tienen que chocar entre sí en el unique de `repuesto_codigos`: el
 * proveedor que factura `30UF450V` y la etiqueta que dice `30 UF 450 V` no son
 * dos códigos distintos, son dos formas de tipear uno.
 */
export function normalizarCodigo(valor: string | null | undefined): string {
  return normalizarTexto(valor).replace(/ /g, '');
}

/**
 * Los términos con los que se busca. Los de un solo carácter se descartan:
 * "a" y "F" aparecen en medio catálogo y empatan todo con todo, que es
 * exactamente lo que arruina la detección de duplicados (spec §2.5).
 */
export function tokenizar(valor: string | null | undefined): string[] {
  const normal = normalizarTexto(valor);
  if (!normal) return [];
  return normal.split(' ').filter((t) => t.length > 1);
}

/**
 * `%` y `_` son comodines de LIKE: sin escaparlos, buscar "50%" trae todo el
 * catálogo. Se usa siempre junto con `ESCAPE '\'` en el SQL.
 */
export function escaparLike(valor: string): string {
  return valor.replace(/[\\%_]/g, (c) => `\\${c}`);
}
