/**
 * Dónde seguir leyendo después de la primera página de un listado: las páginas
 * siguientes y, para cada modelo que tengo en stock, su listado filtrado. Puro.
 */
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function enlaces(html: string, base: URL): URL[] {
  const salida: URL[] = [];
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1].replace(/&amp;/g, '&'), base);
      if (u.host === base.host && (u.protocol === 'http:' || u.protocol === 'https:')) salida.push(u);
    } catch { /* un enlace roto no importa */ }
  }
  return salida;
}

const PARAMETRO_PAGINA = /^(page|pagina|pag|pg|p|offset|desde)$/i;

/** El número de página de una dirección del mismo listado, o null si no es una página suya. */
function numeroDePagina(u: URL, base: URL): number | null {
  const camino = (x: URL) => x.pathname.replace(/\/+$/, '');
  if (camino(u) === camino(base)) {
    for (const [k, v] of u.searchParams) if (PARAMETRO_PAGINA.test(k) && /^\d+$/.test(v)) return Number(v);
    return null;
  }
  // /usados/page/2, /usados/pagina-2, /usados/2
  const resto = camino(u).startsWith(camino(base) + '/') ? camino(u).slice(camino(base).length + 1) : null;
  const m = resto === null ? null : /^(?:(?:page|pagina|pag|p)[/-]?)?(\d{1,4})$/i.exec(resto);
  return m ? Number(m[1]) : null;
}

/** Las páginas que siguen a ésta en el mismo listado, en orden y sin repetir. */
export function paginasSiguientes(html: string, direccion: string, maximo: number): string[] {
  const base = new URL(direccion);
  const actual = numeroDePagina(base, base) ?? -1;
  const vistas = new Map<number, string>();
  for (const u of enlaces(html, base)) {
    const n = numeroDePagina(u, base);
    if (n !== null && n !== actual && !vistas.has(n)) vistas.set(n, u.toString());
  }
  // La primera página suele repetirse como «página 0» o «página 1»: es la que ya se leyó.
  const orden = [...vistas.keys()].sort((a, b) => a - b);
  // Sin número en la dirección leída, la «página 0» es ésta misma. Una «página 1» puede serlo o no: se lee igual y lo repetido se descarta.
  const siguen = orden.filter((n) => (actual === -1 ? n > 0 : n > actual));
  return siguen.slice(0, maximo).map((n) => vistas.get(n) as string);
}

/**
 * Dónde está el listado de un modelo en ese sitio: un enlace de la página que
 * nombre marca y modelo o, si no hay, la forma más común (/listado/marca/modelo).
 * El segundo es un intento: quien lo usa tiene que tolerar que no exista.
 */
export function listadoDeModelo(html: string, direccion: string, marca: string, modelo: string): string {
  const base = new URL(direccion);
  const [m, mo] = [slug(marca), slug(modelo)];
  const candidatos = enlaces(html, base)
    .filter((u) => {
      const partes = u.pathname.toLowerCase().split('/').filter(Boolean);
      // El filtro de un modelo termina en el modelo; la ficha de un auto sigue con versión, año o un id.
      return partes.length >= 2 && partes[partes.length - 1] === mo && partes.includes(m);
    })
    .sort((a, b) => a.pathname.length - b.pathname.length);
  if (candidatos.length) return candidatos[0].toString();
  const u = new URL(base.toString());
  u.search = '';
  u.pathname = `${base.pathname.replace(/\/+$/, '')}/${m}/${mo}`;
  return u.toString();
}
