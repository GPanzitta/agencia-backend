/**
 * El id de un video de YouTube a partir de lo que pegó el taller (S1c-b §3.2).
 *
 * Son once caracteres del alfabeto de YouTube y nada más: el id termina
 * adentro de un `<iframe src="https://www.youtube.com/embed/<id>">` en el
 * portal, así que lo que no matchea exactamente el patrón NO sale de acá.
 */
const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com']);

function soloId(valor: string): string | null {
  // Un segmento de ruta puede traer cola (`0MELX_vb0qY/algo`), y un parámetro
  // también si el enlace vino mal armado.
  const limpio = valor.split(/[?&/#]/)[0];
  return ID.test(limpio) ? limpio : null;
}

export function idDeYoutube(url: string): string | null {
  const texto = (url ?? '').trim();
  if (!texto) return null;
  // El id pelado: es lo que guarda la base, y el ERP lo reenvía tal cual.
  if (ID.test(texto)) return texto;

  // Sin esquema `new URL` no parsea: el taller pega `www.youtube.com/...`
  // muchas más veces de las que pega el `https://`.
  const conEsquema = /^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : `https://${texto}`;
  let u: URL;
  try {
    u = new URL(conEsquema);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;

  const host = u.hostname.replace(/^www\./i, '').toLowerCase();
  if (host === 'youtu.be') return soloId(u.pathname.slice(1));
  if (!HOSTS.has(host)) return null;

  const v = u.searchParams.get('v');
  if (v) return soloId(v);

  const partes = u.pathname.split('/').filter(Boolean);
  if (partes.length >= 2 && ['shorts', 'embed', 'v', 'live'].includes(partes[0])) {
    return soloId(partes[1]);
  }
  return null;
}
