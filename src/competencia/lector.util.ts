/**
 * Lee una página de autos en venta de otro vendedor y saca de ahí lo que se
 * pueda: título, año, kilómetros y precio de cada auto. Puro: recibe el HTML.
 *
 * Tres intentos, del más confiable al menos: datos estructurados (JSON-LD),
 * JSON embebido por la página y, si no, el texto visible alrededor de cada precio.
 */
export interface UnidadAjena {
  titulo: string;
  marca: string | null;
  anio: number | null;
  km: number | null;
  precio: number;
  moneda: 'ARS' | 'USD';
  url: string | null;
  /** Lo demás que dice el aviso: versión, caja, combustible. Sirve para comparar algo más que el precio. */
  detalle?: string | null;
}

export const MARCAS = [
  'Alfa Romeo', 'Audi', 'BAIC', 'BMW', 'BYD', 'Chery', 'Chevrolet', 'Chrysler', 'Citroën', 'Citroen', 'Dodge', 'DS', 'Fiat', 'Ford', 'Geely',
  'Great Wall', 'Haval', 'Honda', 'Hyundai', 'Isuzu', 'JAC', 'Jeep', 'Jetour', 'Kia', 'Land Rover', 'Lexus', 'Lifan', 'Mercedes-Benz', 'Mercedes Benz',
  'Mini', 'Mitsubishi', 'Nissan', 'Peugeot', 'Porsche', 'RAM', 'Renault', 'Seat', 'Subaru', 'Suzuki', 'Toyota', 'Volkswagen', 'VW', 'Volvo',
];

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function marcaDe(texto: string): string | null {
  const t = ` ${sinAcentos(texto)} `;
  for (const m of MARCAS) {
    if (t.includes(` ${sinAcentos(m)} `)) return m === 'VW' ? 'Volkswagen' : m === 'Citroen' ? 'Citroën' : m === 'Mercedes Benz' ? 'Mercedes-Benz' : m;
  }
  return null;
}

/** «1.250.000», «12,500», «18500.00» → número. Los puntos y comas de miles se descartan. */
export function aNumero(crudo: unknown): number | null {
  if (typeof crudo === 'number') return Number.isFinite(crudo) ? crudo : null;
  if (typeof crudo !== 'string') return null;
  let s = crudo.replace(/[^\d.,]/g, '');
  if (!s) return null;
  // Decimales: una coma o un punto seguido de 1 o 2 dígitos al final.
  s = s.replace(/[.,](\d{1,2})$/, 'D$1').replace(/[.,]/g, '').replace('D', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function anioDe(texto: string): number | null {
  const tope = new Date().getFullYear() + 1;
  for (const m of texto.matchAll(/(?<!\d)(19[89]\d|20[0-4]\d)(?!\d)/g)) {
    const a = Number(m[1]);
    if (a <= tope) return a;
  }
  return null;
}

export function kmDe(texto: string): number | null {
  const m = /(\d{1,3}(?:[.,]\d{3})+|\d{1,7})\s*(?:km|kms|kil[oó]metros)\b/i.exec(texto);
  if (m) return aNumero(m[1]);
  return /\b0\s*km\b/i.test(texto) ? 0 : null;
}

/** Con menos de esto, en pesos, no es el precio de un auto: es una cuota, una seña o un accesorio. */
const PISO: Record<'ARS' | 'USD', number> = { ARS: 1_500_000, USD: 1_500 };
const TECHO: Record<'ARS' | 'USD', number> = { ARS: 900_000_000, USD: 600_000 };

export function precioDe(texto: string): { precio: number; moneda: 'ARS' | 'USD' } | null {
  for (const m of texto.matchAll(/(US\$|U\$S|U\$D|USD|u\$s|\$)\s*([\d.,]{4,})/g)) {
    const moneda: 'ARS' | 'USD' = m[1] === '$' ? 'ARS' : 'USD';
    const precio = aNumero(m[2]);
    if (precio !== null && precio >= PISO[moneda] && precio <= TECHO[moneda]) return { precio, moneda };
  }
  return null;
}

export const monedaDe = (crudo: unknown, precio: number): 'ARS' | 'USD' => {
  const c = String(crudo ?? '').toUpperCase();
  if (c === 'USD' || c === 'U$S' || c === 'US$') return 'USD';
  if (c === 'ARS' || c === '$') return 'ARS';
  // Sin moneda declarada: un auto de menos de 400.000 está en dólares.
  return precio < 400_000 ? 'USD' : 'ARS';
};

export function absoluta(url: unknown, base: string): string | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    const u = new URL(url.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString().slice(0, 500) : null;
  } catch { return null; }
}

type Nodo = Record<string, unknown>;
const esObjeto = (v: unknown): v is Nodo => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : esObjeto(v) ? texto(v['name'] ?? v['value'] ?? v['nombre']) : '');
const limpio = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 160);

function armar(titulo: string, extra: { marca?: string; anio?: unknown; km?: unknown; precio: number | null; moneda?: unknown; url?: unknown }, base: string): UnidadAjena | null {
  const t = limpio(titulo);
  if (!t || extra.precio === null) return null;
  const moneda = monedaDe(extra.moneda, extra.precio);
  if (extra.precio < PISO[moneda] || extra.precio > TECHO[moneda]) return null;
  const anio = aNumero(texto(extra.anio).slice(0, 4)) ?? anioDe(t);
  const km = esObjeto(extra.km) || typeof extra.km === 'number' || typeof extra.km === 'string' ? aNumero(texto(extra.km)) : null;
  return {
    titulo: t, marca: marcaDe(`${extra.marca ?? ''} ${t}`), anio: anio !== null && anio >= 1980 && anio <= 2100 ? anio : null,
    km: km !== null && km >= 0 && km < 2_000_000 ? Math.round(km) : kmDe(t), precio: extra.precio, moneda, url: absoluta(extra.url, base),
  };
}

const TIPOS_LD = ['car', 'vehicle', 'product', 'motorcycle', 'motorizedbicycle'];

/** Datos estructurados schema.org: lo que la página declara para los buscadores. */
function deJsonLd(nodo: unknown, base: string, salida: UnidadAjena[]): void {
  if (Array.isArray(nodo)) { nodo.forEach((n) => deJsonLd(n, base, salida)); return; }
  if (!esObjeto(nodo)) return;
  const tipos = ([] as unknown[]).concat(nodo['@type'] ?? []).map((t) => String(t).toLowerCase());
  if (tipos.some((t) => TIPOS_LD.includes(t))) {
    const oferta = ([] as unknown[]).concat(nodo['offers'] ?? [])[0];
    if (esObjeto(oferta)) {
      const u = armar(`${texto(nodo['name'])}`, {
        marca: texto(nodo['brand']) || texto(nodo['manufacturer']), anio: nodo['vehicleModelDate'] ?? nodo['modelDate'] ?? nodo['productionDate'],
        km: nodo['mileageFromOdometer'], precio: aNumero(oferta['price'] ?? oferta['lowPrice']), moneda: oferta['priceCurrency'], url: nodo['url'] ?? oferta['url'],
      }, base);
      if (u) salida.push(u);
    }
  }
  for (const v of Object.values(nodo)) if (typeof v === 'object' && v !== null) deJsonLd(v, base, salida);
}

const CLAVE_PRECIO = /^(price|precio|precio_venta|precioventa|sale_?price|amount|valor)$/i;
const CLAVE_TITULO = /^(title|titulo|name|nombre)$/i;

/** JSON que la página embebe para armarse sola (Next, Nuxt y parecidos). */
function deJsonSuelto(nodo: unknown, base: string, salida: UnidadAjena[], hondo = 0): void {
  if (hondo > 14 || salida.length > 400) return;
  if (Array.isArray(nodo)) { nodo.forEach((n) => deJsonSuelto(n, base, salida, hondo + 1)); return; }
  if (!esObjeto(nodo)) return;
  const claves = Object.keys(nodo);
  const kPrecio = claves.find((k) => CLAVE_PRECIO.test(k));
  if (kPrecio) {
    const crudo = nodo[kPrecio];
    const precio = esObjeto(crudo) ? aNumero(crudo['amount'] ?? crudo['value'] ?? crudo['valor']) : aNumero(crudo);
    const moneda = (esObjeto(crudo) ? crudo['currency'] ?? crudo['currency_id'] ?? crudo['moneda'] : undefined) ?? nodo['currency'] ?? nodo['currency_id'] ?? nodo['moneda'] ?? nodo['priceCurrency'];
    const kTitulo = claves.find((k) => CLAVE_TITULO.test(k));
    const marca = texto(nodo['brand'] ?? nodo['marca'] ?? nodo['make']);
    const modelo = texto(nodo['model'] ?? nodo['modelo']);
    const titulo = (kTitulo ? texto(nodo[kTitulo]) : '') || `${marca} ${modelo} ${texto(nodo['version'])}`;
    const u = armar(titulo, { marca, anio: nodo['year'] ?? nodo['anio'] ?? nodo['año'], km: nodo['km'] ?? nodo['kilometers'] ?? nodo['kilometros'] ?? nodo['mileage'], precio, moneda, url: nodo['url'] ?? nodo['permalink'] ?? nodo['link'] ?? nodo['slug'] }, base);
    // Sin marca reconocible ni año, es cualquier otro precio de la página.
    if (u && (u.marca || u.anio)) { salida.push(u); return; }
  }
  for (const v of Object.values(nodo)) if (typeof v === 'object' && v !== null) deJsonSuelto(v, base, salida, hondo + 1);
}

const ENTIDADES: Record<string, string> = { '&amp;': '&', '&nbsp;': ' ', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&lt;': '<', '&gt;': '>' };

/** El texto visible, una línea por bloque; los enlaces quedan marcados para recuperar su dirección. */
export function aLineas(html: string): string[] {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>/gi, '\n⟦$1⟧')
    .replace(/<\/?(div|li|article|section|p|h[1-6]|tr|td|br|ul|a|span|header|footer|figure|figcaption)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTIDADES[e.toLowerCase()] ?? ' ')
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const MARCA_ENLACE = /⟦([^⟧]*)⟧/g;
const sinEnlaces = (l: string) => l.replace(MARCA_ENLACE, ' ').replace(/\s+/g, ' ').trim();

/** Último recurso: el texto que se ve. Cada precio se junta con el título, el año y los km que tiene cerca. */
/** De «2021 • 49.108 km • 1.8 Precision • Manual» queda «1.8 Precision · Manual»: lo que no es ni el año ni los km. */
export function detalleDe(renglon: string | null | undefined): string | null {
  if (!renglon) return null;
  return renglon.split(/[•|·]/).map((p) => p.trim()).filter((p) => p && !/^(19|20)[0-9]{2}$/.test(p) && kmDe(p) === null && !precioDe(p)).join(' · ').slice(0, 80) || null;
}

const SOLO_MONEDA = /^(US\$|U\$S|U\$D|USD|\$)$/i;

/** Hay sitios que ponen el signo en un renglón y el número en el siguiente: se juntan. */
export function unirMoneda(lineas: string[]): string[] {
  const salida: string[] = [];
  for (let i = 0; i < lineas.length; i++) {
    if (SOLO_MONEDA.test(lineas[i]) && i + 1 < lineas.length && /^[\d.,]{4,}/.test(lineas[i + 1])) { salida.push(`${lineas[i]} ${lineas[i + 1]}`); i++; }
    else salida.push(lineas[i]);
  }
  return salida;
}

function deTexto(html: string, base: string): UnidadAjena[] {
  const lineas = unirMoneda(aLineas(html));
  const conPrecio = lineas.map((l) => precioDe(sinEnlaces(l)) !== null);
  const salida: UnidadAjena[] = [];
  let anterior = -1;
  for (let i = 0; i < lineas.length; i++) {
    const visible = sinEnlaces(lineas[i]);
    const p = precioDe(visible);
    if (!p) continue;
    // Precio tachado y, enseguida, el que vale: se toma el último del grupo.
    if (conPrecio[i + 1] || conPrecio[i + 2]) continue;
    const desde = Math.max(anterior + 1, i - 10);
    const hasta = Math.min(lineas.length - 1, i + 5);
    // El título: la línea con una marca conocida más cercana al precio (primero hacia arriba).
    let titulo = '';
    let dondeTitulo = i;
    const orden = [i, ...Array.from({ length: i - desde }, (_, k) => i - 1 - k), ...Array.from({ length: hasta - i }, (_, k) => i + 1 + k)];
    for (const j of orden) {
      const l = sinEnlaces(lineas[j]).replace(/(US\$|U\$S|U\$D|USD|\$)\s*[\d.,]{4,}/gi, ' ');
      if (j !== i && conPrecio[j]) continue;
      // Hacia abajo, hasta donde empieza la tarjeta del auto siguiente.
      if (j > i && lineas[j].includes('⟦')) break;
      if (marcaDe(l) && l.length <= 140) { titulo = l.replace(/[•|·]/g, ' '); dondeTitulo = j; break; }
    }
    anterior = i;
    if (!titulo) continue;
    // Los datos del auto están entre su título y su precio, o en las líneas que siguen, hasta el próximo precio.
    const primera = Math.min(dondeTitulo, i);
    let ultima = Math.max(dondeTitulo, i);
    for (let k = ultima + 1; k <= Math.min(lineas.length - 1, ultima + 4); k++) {
      if (precioDe(sinEnlaces(lineas[k]))) break;
      ultima = k;
    }
    const junto = lineas.slice(primera, ultima + 1).map(sinEnlaces).join(' · ');
    const enlaces = [...lineas.slice(Math.max(desde, primera - 2), i + 1).join(' ').matchAll(MARCA_ENLACE)].map((m) => m[1]);
    const enlace = enlaces[enlaces.length - 1] ?? '';
    // El renglón de datos del aviso («2021 • 49.108 km • 1.8 Precision • Manual»): sin el año ni los km, queda la versión y la caja.
    const renglon = lineas.slice(primera, ultima + 1).map(sinEnlaces).find((l) => /[•|·]/.test(l) && !marcaDe(l) && (kmDe(l) !== null || anioDe(l) !== null));
    const detalle = detalleDe(renglon);
    salida.push({
      titulo: limpio(titulo), marca: marcaDe(titulo), anio: anioDe(titulo) ?? anioDe(junto) ?? anioDe(enlace), km: kmDe(junto),
      precio: p.precio, moneda: p.moneda, url: absoluta(enlace, base), detalle,
    });
  }
  return salida;
}

function scripts(html: string, filtro: RegExp): string[] {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter((m) => filtro.test(m[1])).map((m) => m[2]);
}

function sinRepetidos(lista: UnidadAjena[]): UnidadAjena[] {
  const vistos = new Set<string>();
  return lista.filter((u) => {
    const clave = `${sinAcentos(u.titulo)}|${u.anio}|${u.precio}|${u.km}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

// Sin barras escritas a mano: en los datos embebidos las comillas pueden venir escapadas (\" o ").
const BARRA = String.fromCharCode(92);
const B = BARRA + BARRA + '?';
const ID_Y_URL = new RegExp(B + '"id' + B + '":' + B + '"?([0-9]{3,12})' + B + '"?,' + B + '"url' + B + '":' + B + '"(https?:[^"' + BARRA + BARRA + ']+)' + B + '"', 'g');

/**
 * Hay sitios donde el enlace del listado nombra la versión («…/cronos-1.3-drive-2022») pero no el
 * aviso: sin su número, la página muestra cualquier auto de esa versión, y todos los enlaces terminan
 * en el mismo lugar. Si la página trae el número de cada aviso junto a su dirección, se le agrega.
 */
export function conNumeroDeAviso(unidades: UnidadAjena[], html: string): UnidadAjena[] {
  const numeros = new Map<string, string[]>();
  for (const m of html.matchAll(ID_Y_URL)) {
    const lista = numeros.get(m[2]) ?? [];
    if (!lista.includes(m[1])) lista.push(m[1]);
    numeros.set(m[2], lista);
  }
  if (!numeros.size) return unidades;
  // Dos avisos de la misma versión comparten dirección: los números se reparten en el orden de la página.
  const usados = new Map<string, number>();
  return unidades.map((u) => {
    if (!u.url || u.url.includes('?')) return u;
    const lista = numeros.get(u.url);
    if (!lista) return u;
    const i = usados.get(u.url) ?? 0;
    usados.set(u.url, i + 1);
    return lista[i] ? { ...u, url: u.url + '?id=' + lista[i] } : u;
  });
}

const INICIO_DE_AVISO = /[{]"id":"?([0-9]{3,12})"?,"url":"https?:/g;

/**
 * Los avisos como los trae la propia página para dibujarse: un objeto por tarjeta, con su número,
 * su dirección, el título, el renglón de datos y el precio. Es más confiable que leer el texto
 * visible, porque cada dato viene en su lugar. Los nombres de los campos son los habituales
 * (title, subtitle, price…); un sitio que use otros cae en las otras lecturas.
 */
export function deDatosDeTarjetas(html: string, base: string): UnidadAjena[] {
  const plano = html.split(BARRA + '"').join('"');
  const salida: UnidadAjena[] = [];
  for (const m of plano.matchAll(INICIO_DE_AVISO)) {
    const desde = m.index ?? 0;
    // El objeto termina donde se cierra su llave; con un tope, por si el texto está cortado.
    let hondo = 0;
    let hasta = -1;
    for (let i = desde; i < Math.min(plano.length, desde + 6000); i++) {
      if (plano[i] === '{') hondo++;
      else if (plano[i] === '}' && --hondo === 0) { hasta = i; break; }
    }
    if (hasta < 0) continue;
    let o: Nodo;
    try { o = JSON.parse(plano.slice(desde, hasta + 1)) as Nodo; } catch { continue; }
    const extra = esObjeto(o['analytics']) ? o['analytics'] : {};
    const marca = texto(extra['car_make'] ?? o['brand'] ?? o['make'] ?? o['marca']);
    const modelo = texto(extra['car_model'] ?? o['model'] ?? o['modelo']);
    const titulo = (texto(o['title'] ?? o['name'] ?? o['titulo']) || marca + ' ' + modelo).replace(/[•|·]/g, ' ');
    const renglon = texto(o['subtitle'] ?? o['description'] ?? o['subtitulo']);
    const precio = aNumero(extra['car_price'] ?? o['mainPrice'] ?? o['price'] ?? o['precio']);
    const u = armar(titulo, {
      marca, anio: extra['car_year'] ?? o['year'] ?? o['anio'] ?? anioDe(renglon), km: kmDe(renglon) ?? o['km'] ?? o['mileage'],
      precio, moneda: o['currency'] ?? o['moneda'] ?? (/US|U[$]S/i.test(texto(o['symbol'])) ? 'USD' : undefined), url: o['url'],
    }, base);
    if (!u || !u.marca) continue;
    salida.push({ ...u, url: u.url && !u.url.includes('?') ? u.url + '?id=' + m[1] : u.url, detalle: detalleDe(renglon) });
  }
  return salida;
}

export const MAXIMO_UNIDADES = 600;

/** Los autos en venta que se pudieron leer de la página. Vacío si no se reconoció ninguno. */
export function extraerUnidades(html: string, base: string): UnidadAjena[] {
  const intentar = (crudos: string[], leer: (n: unknown, salida: UnidadAjena[]) => void) => {
    const salida: UnidadAjena[] = [];
    for (const c of crudos) { try { leer(JSON.parse(c.trim()), salida); } catch { /* un bloque roto no frena a los demás */ } }
    return sinRepetidos(salida);
  };
  const estructurados = intentar(scripts(html, /application\/ld\+json/i), (n, s) => deJsonLd(n, base, s));
  const embebidos = intentar(scripts(html, /application\/json|__NEXT_DATA__|__NUXT/i), (n, s) => deJsonSuelto(n, base, s));
  const tarjetas = sinRepetidos(deDatosDeTarjetas(html, base));
  const visibles = sinRepetidos(deTexto(html, base));
  // Gana la lectura que más autos encontró; a igualdad, la más confiable (van en ese orden).
  const mejor = [estructurados, tarjetas, embebidos, visibles].reduce((a, b) => (b.length > a.length ? b : a));
  return conNumeroDeAviso(mejor, html).slice(0, MAXIMO_UNIDADES);
}

/** Direcciones a las que el servidor no debe pedirle nada: la propia máquina y las redes internas. */
export function esDireccionInterna(ip: string): boolean {
  const v4 = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/i.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const s = ip.toLowerCase();
  return s === '::' || s === '::1' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80') || s.startsWith('ff');
}
