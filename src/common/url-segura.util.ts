/**
 * SEG-46: las URLs que terminan como `href` en el portal (las que configura el
 * taller: redes, banners; la de las opiniones de Google; el `init_point` de
 * Mercado Pago). El portal ya las filtra (`hrefSeguro`, `destinoDePago`); esta
 * es la defensa del lado del servidor, para que no se guarde ni se devuelva
 * algo que el portal tenga que descartar.
 */

/**
 * `null` si la URL sirve; si no, qué tiene mal, en castellano y para mostrar.
 * Sólo `https:`, con host escrito tal cual, sin usuario ni clave
 * (`https://taller@otro-host` lleva a `otro-host`) y sin espacios ni
 * caracteres de control.
 */
export function motivoUrlInsegura(valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor.trim()) return 'falta la dirección';
  const v = valor.trim();
  // eslint-disable-next-line no-control-regex -- justamente se buscan los caracteres de control
  if (/[\s\u0000-\u001f\u007f\\]/.test(v)) return 'tiene espacios o caracteres no válidos';
  if (!/^https:\/\//i.test(v)) return 'tiene que empezar con https://';
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return 'no es una dirección válida';
  }
  if (url.username || url.password || v.slice('https://'.length).split(/[/?#]/)[0].includes('@')) {
    return 'no puede llevar usuario ni clave antes del sitio (lo que va antes de «@»)';
  }
  // `new URL('https:///x')` normaliza a host `x`: se exige que el host esté escrito tal cual.
  if (!url.hostname || !v.slice('https://'.length).toLowerCase().startsWith(url.host)) {
    return 'no tiene un sitio válido después de https://';
  }
  return null;
}

/** La URL si es segura (recortada); `null` si no. Para datos que vienen de afuera (Google). */
export function urlSeguraONull(valor: unknown): string | null {
  return motivoUrlInsegura(valor) === null ? (valor as string).trim() : null;
}

const HOSTS_MP = ['mercadopago.com', 'mercadopago.com.ar'];

/** El link de pago que devuelve MP: https y de mercadopago.com(.ar) o un subdominio. */
export function esInitPointDeMp(valor: unknown): boolean {
  if (motivoUrlInsegura(valor) !== null) return false;
  const host = new URL((valor as string).trim()).hostname.toLowerCase();
  return HOSTS_MP.some((h) => host === h || host.endsWith(`.${h}`));
}
