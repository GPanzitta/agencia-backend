import { UnidadAjena, marcaDe } from './lector.util';

export interface UnidadPropia { id: string; numero: string; marca: string; modelo: string; version: string | null; anio: number; km: number; precio: number | null; moneda: 'ARS' | 'USD'; transmision?: string | null }
/** Qué tan parecido es un aviso a mi auto: 2 = misma versión, 1 = mismo motor y caja, 0 = sólo el modelo. */
export type Nivel = 0 | 1 | 2;
export interface Comparable extends UnidadAjena {
  fuente: string;
  /** Su precio pasado a la moneda de mi auto; null si hace falta el dólar y no se cargó. */
  precio_en_mi_moneda: number | null;
  nivel: Nivel;
  /** Entró en la cuenta del veredicto. */
  medido: boolean;
}
export type Veredicto = 'sin_precio' | 'sin_comparables' | 'falta_dolar' | 'buen_precio' | 'en_precio' | 'caro_pero_mejor' | 'caro';
export type Base = 'misma_version' | 'mismo_motor' | 'mismo_modelo';

export interface Comparacion {
  unidad: UnidadPropia;
  comparables: Comparable[];
  /** El precio del medio entre los avisos medidos, en la moneda de mi auto. */
  referencia: number | null;
  /** Lo que esos avisos dicen que vale un auto con MIS kilómetros y MI año. null si no alcanzan para estimarlo. */
  esperado: number | null;
  /** Cuánto más caro (+) o más barato (−) estoy, en %: contra el esperado si lo hay, si no contra la referencia. */
  diferencia_pct: number | null;
  veredicto: Veredicto;
  /** Contra qué se midió. */
  base: Base;
  /** Por qué: en una oración, para leer de un vistazo. */
  motivo: string;
}

const norma = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** ¿Es el mismo modelo? Misma marca, el modelo aparece en su título y el año está a lo sumo a uno de distancia. */
export function esComparable(mia: UnidadPropia, ajena: UnidadAjena): boolean {
  const marca = marcaDe(mia.marca) ?? mia.marca;
  if (!ajena.marca || norma(ajena.marca) !== norma(marca)) return false;
  const titulo = ` ${norma(ajena.titulo)} `;
  const modelo = norma(mia.modelo);
  if (!modelo || !titulo.includes(` ${modelo} `)) return false;
  return ajena.anio === null || Math.abs(ajena.anio - mia.anio) <= 1;
}

const CILINDRADA = /(?<![0-9])([0-9])[.,]([0-9])(?![0-9])/;
/** «1.3», «2.0»: el motor, que es lo que más separa una versión de otra. */
export const cilindradaDe = (texto: string | null | undefined): string | null => {
  const m = CILINDRADA.exec(texto ?? '');
  return m ? `${m[1]}.${m[2]}` : null;
};

/** La caja, como venga escrita: en el aviso («Manual», «Automático», «CVT», «AT») o en mi ficha. */
export function cajaDe(texto: string | null | undefined): 'manual' | 'automatica' | null {
  const t = norma(texto ?? '');
  if (/(^| )(automatic[oa]|automatica|cvt|at|tiptronic|dsg|edc|aut)( |$)/.test(t)) return 'automatica';
  if (/(^| )(manual|mt)( |$)/.test(t)) return 'manual';
  return null;
}

/** Palabras que aparecen en una versión y no la distinguen: la caja, la carrocería, el combustible, las siglas del motor. */
const RUIDO = new Set([
  'manual', 'mt', 'automatico', 'automatica', 'aut', 'at', 'cvt', 'tiptronic', 'dsg', 'edc', 'sedan', 'hatchback', 'hb', 'suv', 'pickup', 'pick', 'up', 'rural',
  'nafta', 'diesel', 'gnc', 'gse', 'firefly', 'tsi', 'msi', 'mpi', 'tdi', 'hdi', 'td', 'turbo', '16v', '8v', '3p', '4p', '5p', 'cv', 'hp', 'cd', 'cs', 'cabina', 'doble', 'simple',
]);

/**
 * Lo que distingue una versión de otra del mismo motor: «drive», «precision», «pack conectividad», «4x4».
 * Sin números sueltos ni las palabras de `RUIDO`, ni la marca y el modelo.
 */
export function firmaDeVersion(texto: string | null | undefined, marca: string, modelo: string): string {
  const fuera = new Set([...norma(marca).split(' '), ...norma(modelo).split(' ')]);
  const palabras = norma(texto ?? '').replace(/4wd/g, '4x4').replace(/2wd/g, '4x2').split(' ')
    .filter((p) => p.length > 1 && !/^[0-9]+$/.test(p) && !RUIDO.has(p) && !fuera.has(p));
  return [...new Set(palabras)].sort().join(' ');
}

/** Qué tan parecido es el aviso: mismo motor y caja (1) y, además, mismas palabras de versión (2). Sin dato no se afirma. */
export function nivelDe(mia: UnidadPropia, ajena: UnidadAjena): Nivel {
  const suTexto = `${ajena.detalle ?? ''} ${ajena.titulo}`;
  const [miMotor, suMotor] = [cilindradaDe(mia.version), cilindradaDe(suTexto)];
  if (!miMotor || !suMotor || miMotor !== suMotor) return 0;
  const [miCaja, suCaja] = [cajaDe(`${mia.transmision ?? ''} ${mia.version ?? ''}`), cajaDe(suTexto)];
  if (miCaja && suCaja && miCaja !== suCaja) return 0;
  const miFirma = firmaDeVersion(mia.version, mia.marca, mia.modelo);
  return miFirma && miFirma === firmaDeVersion(suTexto, mia.marca, mia.modelo) ? 2 : 1;
}

export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

const MINIMO_PARA_ESTIMAR = 5;

/**
 * Lo que los avisos dicen que vale un auto con esos km y ese año: una recta ajustada por mínimos
 * cuadrados (precio según km y año). Hace falta un mínimo de avisos y que la recta tenga sentido
 * —más km no puede subir el precio, ni un año más nuevo bajarlo—; si no, no se estima.
 */
export function precioEsperado(avisos: { precio: number; km: number | null; anio: number | null }[], km: number, anio: number): number | null {
  const p = avisos.filter((a): a is { precio: number; km: number; anio: number } => a.km !== null && a.anio !== null);
  if (p.length < MINIMO_PARA_ESTIMAR) return null;
  const media = (f: (a: (typeof p)[number]) => number) => p.reduce((s, a) => s + f(a), 0) / p.length;
  const [mk, ma, mp] = [media((a) => a.km), media((a) => a.anio), media((a) => a.precio)];
  let [skk, saa, ska, skp, sap] = [0, 0, 0, 0, 0];
  for (const a of p) {
    const [dk, da, dp] = [a.km - mk, a.anio - ma, a.precio - mp];
    skk += dk * dk; saa += da * da; ska += dk * da; skp += dk * dp; sap += da * dp;
  }
  if (skk === 0) return null; // todos con los mismos km: no hay de dónde sacar la pendiente
  const det = skk * saa - ska * ska;
  let [bk, ba] = Math.abs(det) > 1e-9 * skk * Math.max(saa, 1) ? [(saa * skp - ska * sap) / det, (skk * sap - ska * skp) / det] : [skp / skk, 0];
  // Si el año sale «al revés» (pocos avisos, o todos del mismo año), se estima sólo con los km.
  if (ba < 0) [bk, ba] = [skp / skk, 0];
  if (bk > 0) return null;
  const estimado = mp + bk * (km - mk) + ba * (anio - ma);
  // No se extrapola más allá de lo publicado: un auto con muchos menos km no «vale» el doble.
  const [minimo, maximo] = [Math.min(...p.map((a) => a.precio)), Math.max(...p.map((a) => a.precio))];
  return Math.round(Math.min(maximo * 1.1, Math.max(minimo * 0.9, estimado)) * 100) / 100;
}

const ROTULO_BASE: Record<Base, string> = { misma_version: 'de su misma versión', mismo_motor: 'con su mismo motor y caja', mismo_modelo: 'del modelo' };

export function comparar(mia: UnidadPropia, ajenas: (UnidadAjena & { fuente: string })[], dolar: number | null): Comparacion {
  const todos = ajenas.filter((a) => esComparable(mia, a)).map((a) => ({
    ...a,
    nivel: nivelDe(mia, a),
    medido: false,
    precio_en_mi_moneda: a.moneda === mia.moneda ? a.precio : dolar ? Math.round((mia.moneda === 'ARS' ? a.precio * dolar : a.precio / dolar) * 100) / 100 : null,
  }));
  const vacio = { unidad: mia, comparables: todos as Comparable[], referencia: null, esperado: null, diferencia_pct: null, base: 'mismo_modelo' as Base };
  if (mia.precio === null) return { ...vacio, veredicto: 'sin_precio', motivo: 'Todavía no tiene precio de venta.' };
  if (!todos.length) return { ...vacio, veredicto: 'sin_comparables', motivo: 'Ningún otro vendedor cargado tiene este modelo.' };
  const conPrecio = todos.filter((c) => c.precio_en_mi_moneda !== null);
  if (!conPrecio.length) return { ...vacio, veredicto: 'falta_dolar', motivo: 'Lo publican en otra moneda: cargá a cuánto tomás el dólar para comparar.' };

  // Se mide contra lo más parecido que haya, siempre que sean al menos dos: con uno solo no hay referencia.
  const [iguales, parecidos] = [conPrecio.filter((c) => c.nivel === 2), conPrecio.filter((c) => c.nivel >= 1)];
  const base: Base = iguales.length >= 2 ? 'misma_version' : parecidos.length >= 2 ? 'mismo_motor' : 'mismo_modelo';
  const medidos = base === 'misma_version' ? iguales : base === 'mismo_motor' ? parecidos : conPrecio;
  const comparables: Comparable[] = todos.map((c) => ({ ...c, medido: medidos.includes(c) }));

  const precios = medidos.map((c) => c.precio_en_mi_moneda as number);
  const referencia = mediana(precios) as number;
  const esperado = precioEsperado(medidos.map((c) => ({ precio: c.precio_en_mi_moneda as number, km: c.km, anio: c.anio })), mia.km, mia.anio);
  const contra = esperado ?? referencia;
  const diferencia_pct = Math.round(((mia.precio - contra) / contra) * 1000) / 10;
  const quienes = medidos.length === 1 ? 'el otro que hay publicado' : `los ${medidos.length} publicados ${ROTULO_BASE[base]}`;
  const comun = { unidad: mia, comparables, referencia, esperado, diferencia_pct, base };

  if (esperado !== null) {
    // Los km y el año ya están descontados en el precio esperado: el veredicto es sólo la diferencia.
    const veredicto: Veredicto = diferencia_pct <= -3 ? 'buen_precio' : diferencia_pct < 5 ? 'en_precio' : 'caro';
    const como = diferencia_pct <= -3 ? `está ${Math.abs(diferencia_pct)} % por debajo` : diferencia_pct < 5 ? 'está en línea' : `está ${diferencia_pct} % arriba`;
    return { ...comun, veredicto, motivo: `Por sus kilómetros y su año, ${quienes} dan un precio esperado y este auto ${como}.` };
  }

  // Sin avisos suficientes para estimar: contra el precio del medio, mirando aparte los km y el año.
  const kmRef = mediana(medidos.map((c) => c.km).filter((k): k is number => k !== null));
  const anioRef = mediana(medidos.map((c) => c.anio).filter((a): a is number => a !== null));
  const menosKm = kmRef !== null && kmRef > 0 && mia.km <= kmRef * 0.8;
  const masKm = kmRef !== null && mia.km >= kmRef * 1.2 && mia.km - kmRef >= 10_000;
  const masNuevo = anioRef !== null && mia.anio > anioRef;
  const ventaja = [menosKm ? 'tiene menos kilómetros' : null, masNuevo ? 'es más nuevo' : null].filter(Boolean).join(' y ');
  let veredicto: Veredicto; let motivo: string;
  if (diferencia_pct <= -3) { veredicto = 'buen_precio'; motivo = `Está ${Math.abs(diferencia_pct)} % por debajo de ${quienes}${masKm ? ', aunque tiene más kilómetros' : ''}.`; }
  else if (diferencia_pct < 5) { veredicto = 'en_precio'; motivo = `Está en línea con ${quienes}${ventaja ? ` y además ${ventaja}` : masKm ? ', pero tiene más kilómetros' : ''}.`; }
  else if (ventaja) { veredicto = 'caro_pero_mejor'; motivo = `Está ${diferencia_pct} % arriba de ${quienes}, pero ${ventaja}.`; }
  else { veredicto = 'caro'; motivo = `Está ${diferencia_pct} % arriba de ${quienes}${masKm ? ' y tiene más kilómetros' : ' sin tener menos kilómetros ni ser más nuevo'}.`; }
  // «arriba de el otro» → «arriba del otro».
  return { ...comun, veredicto, motivo: motivo.replace(/ de el /g, ' del ') };
}
