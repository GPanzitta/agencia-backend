// SOPORTE DE MIGRACIONES: el módulo ya no existe; este archivo queda sólo porque una migración del historial lo importa.
import { normalizarTexto } from './normalizar-texto.util';

export interface FuenteTextoBusqueda {
  name?: string | null;
  codigo?: string | null;
  numero_parte?: string | null;
  marca?: string | null;
  modelo?: string | null;
  categoria?: string | null;
  /** Los códigos alternativos, tal como se tipearon. */
  alias?: (string | null | undefined)[];
}

/**
 * Lo que se guarda en `ingredients.texto_busqueda` (spec §2.1).
 *
 * De cada valor se guardan DOS formas: la normalizada con espacios ("pl 100")
 * y la compacta ("pl100"). Sin la compacta, buscar `pl100` no encuentra
 * `PL-100`, que es uno de los casos que esta spec vino a arreglar; sin la de
 * espacios, buscar `pl 100` tampoco lo encuentra. Guardar las dos cuesta unos
 * bytes por fila y hace que las dos búsquedas funcionen con el mismo `LIKE`.
 */
export function textoDeBusqueda(fuente: FuenteTextoBusqueda): string {
  const fragmentos: string[] = [];
  const agregar = (valor?: string | null) => {
    const normal = normalizarTexto(valor);
    if (!normal) return;
    fragmentos.push(normal);
    const compacto = normal.replace(/ /g, '');
    if (compacto !== normal) fragmentos.push(compacto);
  };

  agregar(fuente.name);
  agregar(fuente.codigo);
  agregar(fuente.numero_parte);
  agregar(fuente.marca);
  agregar(fuente.modelo);
  agregar(fuente.categoria);
  for (const alias of fuente.alias ?? []) agregar(alias);

  // Sin repetidos y en orden de aparición: el texto tiene que ser el mismo
  // para la misma entrada, o el backfill y el servicio escribirían distinto.
  return Array.from(new Set(fragmentos.join(' ').split(' ').filter(Boolean))).join(' ');
}
