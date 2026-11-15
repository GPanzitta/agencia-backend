import { lookup } from 'dns/promises';

import { ErrorDeNegocio } from '../common/errores/error-negocio';
import { esDireccionInterna } from './lector.util';

const MAXIMO_BYTES = 4 * 1024 * 1024;
const ESPERA_MS = 12_000;
const SALTOS = 3;

const error = (mensaje: string) => new ErrorDeNegocio('DATOS_INVALIDOS', mensaje);

/** El servidor sólo le pide páginas a sitios públicos: nunca a sí mismo ni a la red interna. */
async function validar(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw error('La dirección tiene que empezar con http:// o https://.');
  if (url.username || url.password) throw error('La dirección no puede llevar usuario ni clave.');
  if (url.port && !['80', '443'].includes(url.port)) throw error('Esa dirección usa un puerto que no se puede leer.');
  let direcciones: { address: string }[];
  try { direcciones = await lookup(url.hostname, { all: true }); } catch { throw error('No encontramos ese sitio: revisá que la dirección esté bien escrita.'); }
  if (!direcciones.length || direcciones.some((d) => esDireccionInterna(d.address))) throw error('Esa dirección no es un sitio público.');
}

/** Baja el HTML de una página pública, siguiendo redirecciones de a una y revisando cada destino. */
export async function bajarPagina(direccion: string): Promise<{ html: string; url: string }> {
  let url: URL;
  try { url = new URL(direccion); } catch { throw error('Esa dirección no es válida.'); }
  for (let salto = 0; salto <= SALTOS; salto++) {
    await validar(url);
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), ESPERA_MS);
    try {
      const r = await fetch(url, {
        redirect: 'manual', signal: corte.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; comparador-de-precios)', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'es-AR,es;q=0.9' },
      });
      if (r.status >= 300 && r.status < 400) {
        const destino = r.headers.get('location');
        if (!destino) throw error('El sitio redirige a ningún lado.');
        url = new URL(destino, url);
        continue;
      }
      if (r.status === 401 || r.status === 403 || r.status === 429) throw error('Ese sitio no deja que lo lean programas (pide iniciar sesión o bloquea la consulta).');
      if (!r.ok) throw error(`El sitio contestó con un error (${r.status}).`);
      const tipo = r.headers.get('content-type') ?? '';
      if (tipo && !/html|xml|text\/plain/i.test(tipo)) throw error('Esa dirección no es una página web.');
      const lector = r.body?.getReader();
      if (!lector) throw error('El sitio no devolvió nada.');
      const partes: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAXIMO_BYTES) { await lector.cancel(); break; }
        partes.push(value);
      }
      return { html: Buffer.concat(partes).toString('utf8'), url: url.toString() };
    } catch (e) {
      if (e instanceof ErrorDeNegocio) throw e;
      throw error(corte.signal.aborted ? 'El sitio tardó demasiado en contestar.' : 'No pudimos conectarnos con ese sitio.');
    } finally {
      clearTimeout(reloj);
    }
  }
  throw error('El sitio redirige demasiadas veces.');
}
