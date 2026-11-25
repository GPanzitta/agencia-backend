import type { OrigenUnidad } from '../unidades/entities/unidad.entity';

/**
 * Reglas puras del tablero de rentabilidad (23/11/2026): qué deja cada auto, qué
 * se está comiendo el margen y qué capital está parado. Sin base ni reloj propio.
 *
 * Todo se cuenta por moneda y nunca se mezclan pesos con dólares: la agencia
 * puede tener stock en las dos, y sumarlas con un tipo de cambio inventado
 * daría un número que no existe en ninguna caja.
 */

export type MonedaTablero = 'ARS' | 'USD';
export type PorMoneda = { ARS: number; USD: number };
/** El porcentaje de cada moneda; `null` cuando no hay base para calcularlo. */
export type PorMonedaPct = { ARS: number | null; USD: number | null };

const centavos = (n: number) => Math.round(n * 100) / 100;

export const cero = (): PorMoneda => ({ ARS: 0, USD: 0 });
export const ceroPct = (): PorMonedaPct => ({ ARS: null, USD: null });

/** Un porcentaje con un decimal; `null` si la base no sirve (cero o negativa). */
export function porcentaje(parte: number, base: number): number | null {
  if (!(base > 0)) return null;
  return Math.round((parte / base) * 1000) / 10;
}

/** Suma en la moneda que corresponde (se usa acumulando en un bucle). */
export function sumarEn(cuenta: PorMoneda, moneda: MonedaTablero, valor: number): PorMoneda {
  cuenta[moneda] = centavos(cuenta[moneda] + valor);
  return cuenta;
}

// ─── Stock: lo que hay, lo que vale y lo que dejaría ────────────────────────

export interface FilaDeStock {
  id: string;
  numero: string;
  titulo: string;
  dominio: string | null;
  origen: OrigenUnidad;
  estado: string;
  moneda: MonedaTablero;
  /** Lo que la agencia lleva puesto: compra (o toma) más alistaje. */
  costo: number;
  /** Consignación: lo mínimo que hay que liquidarle al dueño. En los demás orígenes, cero. */
  piso: number;
  /** Con qué precio se espera cerrar: el de la reserva si está reservada, si no el de lista. */
  precio: number | null;
  dias: number;
  papeles_en_rojo: boolean;
  reservada: boolean;
}

/** Lo que dejaría si se vende al precio esperado. `null` si todavía no tiene precio. */
export function margenDeStock(f: FilaDeStock): number | null {
  return f.precio === null ? null : centavos(f.precio - f.piso - f.costo);
}

export interface ResumenStock {
  unidades: number;
  /** Cuántas tienen precio como para estimar el margen. */
  con_precio: number;
  /** Capital inmovilizado: el costo de todo lo que está en la playa. */
  capital: PorMoneda;
  /** Lo que entraría si se vende todo al precio esperado. */
  venta: PorMoneda;
  margen: PorMoneda;
  /** Margen sobre la venta. */
  margen_pct: PorMonedaPct;
  dias_promedio: number;
  /** Más de 60 días: la regla que ya usa el resto del sistema. */
  parados: { cuantos: number; capital: PorMoneda };
  papeles_en_rojo: { cuantos: number; capital: PorMoneda };
  sin_precio: { cuantos: number; capital: PorMoneda };
}

export function resumenDeStock(filas: FilaDeStock[]): ResumenStock {
  const capital = cero();
  const venta = cero();
  const margen = cero();
  const capitalParados = cero();
  const capitalRojos = cero();
  const capitalSinPrecio = cero();
  let conPrecio = 0;
  let parados = 0;
  let rojos = 0;
  let sinPrecio = 0;
  let dias = 0;

  for (const f of filas) {
    sumarEn(capital, f.moneda, f.costo);
    dias += f.dias;
    if (f.precio === null) {
      sinPrecio++;
      sumarEn(capitalSinPrecio, f.moneda, f.costo);
    } else {
      conPrecio++;
      sumarEn(venta, f.moneda, f.precio);
      sumarEn(margen, f.moneda, margenDeStock(f) ?? 0);
    }
    if (f.dias > 60) {
      parados++;
      sumarEn(capitalParados, f.moneda, f.costo);
    }
    if (f.papeles_en_rojo) {
      rojos++;
      sumarEn(capitalRojos, f.moneda, f.costo);
    }
  }

  return {
    unidades: filas.length,
    con_precio: conPrecio,
    capital,
    venta,
    margen,
    margen_pct: { ARS: porcentaje(margen.ARS, venta.ARS), USD: porcentaje(margen.USD, venta.USD) },
    dias_promedio: filas.length ? Math.round(dias / filas.length) : 0,
    parados: { cuantos: parados, capital: capitalParados },
    papeles_en_rojo: { cuantos: rojos, capital: capitalRojos },
    sin_precio: { cuantos: sinPrecio, capital: capitalSinPrecio },
  };
}

/** Cuánto hace que está cada auto, agrupado: sirve para ver si el stock envejece. */
export interface Tramo {
  rotulo: string;
  desde: number;
  hasta: number | null;
  cuantos: number;
  capital: PorMoneda;
}

const TRAMOS: Omit<Tramo, 'cuantos' | 'capital'>[] = [
  { rotulo: 'Hasta 30 días', desde: 0, hasta: 30 },
  { rotulo: '31 a 60 días', desde: 31, hasta: 60 },
  { rotulo: '61 a 90 días', desde: 61, hasta: 90 },
  { rotulo: 'Más de 90 días', desde: 91, hasta: null },
];

export function antiguedadDeStock(filas: FilaDeStock[]): Tramo[] {
  const tramos: Tramo[] = TRAMOS.map((t) => ({ ...t, cuantos: 0, capital: cero() }));
  for (const f of filas) {
    const t = tramos.find((x) => f.dias >= x.desde && (x.hasta === null || f.dias <= x.hasta));
    if (!t) continue;
    t.cuantos++;
    sumarEn(t.capital, f.moneda, f.costo);
  }
  return tramos;
}

// ─── Ventas cerradas: lo que dejaron de verdad ──────────────────────────────

export interface FilaDeVenta {
  id: string;
  numero: string;
  vendedorId: string | null;
  moneda: MonedaTablero;
  /** Lo que se cobró. */
  precio: number;
  /** El precio de lista de la unidad: contra esto se mide el descuento. */
  lista: number | null;
  costo: number;
  piso: number;
  comision: number;
  dias: number;
  origen: OrigenUnidad;
}

/** Cobrado menos lo que costó (y, en consignación, menos el piso del dueño). */
export const margenBruto = (v: FilaDeVenta): number => centavos(v.precio - v.piso - v.costo);

/** Lo que le queda a la agencia después de pagarle al vendedor. */
export const margenNeto = (v: FilaDeVenta): number => centavos(margenBruto(v) - v.comision);

/** Lo que se bajó del precio de lista para cerrar. Nunca negativo: si se vendió sobre lista, no hay descuento. */
export const descuentoDe = (v: FilaDeVenta): number => (v.lista === null ? 0 : Math.max(0, centavos(v.lista - v.precio)));

export interface ResumenVentas {
  operaciones: number;
  facturado: PorMoneda;
  costo: PorMoneda;
  margen: PorMoneda;
  comisiones: PorMoneda;
  /** Margen menos comisiones. */
  neto: PorMoneda;
  descuento: PorMoneda;
  /** Descuento sobre lo que se habría cobrado a precio de lista. */
  descuento_pct: PorMonedaPct;
  margen_pct: PorMonedaPct;
  /** Facturado promedio por operación. */
  ticket: PorMoneda;
  dias_promedio: number;
}

interface Cuenta {
  operaciones: number;
  /** Cuántas operaciones hubo en cada moneda: el ticket promedio no se calcula sobre el total. */
  ventas_por_moneda: PorMoneda;
  facturado: PorMoneda;
  costo: PorMoneda;
  margen: PorMoneda;
  comisiones: PorMoneda;
  neto: PorMoneda;
  descuento: PorMoneda;
  lista: PorMoneda;
  dias: number;
}

const nuevaCuenta = (): Cuenta => ({
  operaciones: 0,
  ventas_por_moneda: cero(),
  facturado: cero(),
  costo: cero(),
  margen: cero(),
  comisiones: cero(),
  neto: cero(),
  descuento: cero(),
  lista: cero(),
  dias: 0,
});

function acumular(c: Cuenta, v: FilaDeVenta): void {
  const m = v.moneda;
  c.operaciones++;
  c.dias += v.dias;
  sumarEn(c.ventas_por_moneda, m, 1);
  sumarEn(c.facturado, m, v.precio);
  sumarEn(c.costo, m, v.costo);
  sumarEn(c.margen, m, margenBruto(v));
  sumarEn(c.comisiones, m, v.comision);
  sumarEn(c.neto, m, margenNeto(v));
  sumarEn(c.descuento, m, descuentoDe(v));
  if (v.lista !== null) sumarEn(c.lista, m, v.lista);
}

function cerrar(c: Cuenta): ResumenVentas {
  const ticket = cero();
  for (const m of ['ARS', 'USD'] as const) {
    if (c.ventas_por_moneda[m] > 0) ticket[m] = centavos(c.facturado[m] / c.ventas_por_moneda[m]);
  }
  return {
    operaciones: c.operaciones,
    facturado: c.facturado,
    costo: c.costo,
    margen: c.margen,
    comisiones: c.comisiones,
    neto: c.neto,
    descuento: c.descuento,
    descuento_pct: { ARS: porcentaje(c.descuento.ARS, c.lista.ARS), USD: porcentaje(c.descuento.USD, c.lista.USD) },
    margen_pct: { ARS: porcentaje(c.margen.ARS, c.facturado.ARS), USD: porcentaje(c.margen.USD, c.facturado.USD) },
    ticket,
    dias_promedio: c.operaciones ? Math.round(c.dias / c.operaciones) : 0,
  };
}

export function resumenDeVentas(filas: FilaDeVenta[]): ResumenVentas {
  const c = nuevaCuenta();
  for (const v of filas) acumular(c, v);
  return cerrar(c);
}

// ─── Por vendedor y por origen ──────────────────────────────────────────────

export interface FilaVendedor extends ResumenVentas {
  id: string | null;
  nombre: string;
}

/**
 * El ranking de vendedores por lo que cerraron en el período. El que no vendió
 * no aparece: acá se mide fuga de margen, no cumplimiento de horario.
 */
export function porVendedor(filas: FilaDeVenta[], nombres: Map<string, string>): FilaVendedor[] {
  const cuentas = new Map<string, Cuenta>();
  for (const v of filas) {
    const clave = v.vendedorId ?? '';
    const c = cuentas.get(clave) ?? nuevaCuenta();
    acumular(c, v);
    cuentas.set(clave, c);
  }
  return [...cuentas.entries()]
    .map(([clave, c]) => ({ id: clave || null, nombre: nombres.get(clave) ?? 'Sin vendedor', ...cerrar(c) }))
    .sort((a, b) => b.operaciones - a.operaciones || b.descuento.USD - a.descuento.USD || b.neto.USD - a.neto.USD);
}

export interface FilaOrigen extends ResumenVentas {
  origen: OrigenUnidad;
}

/** Los tres orígenes siempre, aunque no hayan vendido: el dueño compara contra el mismo cuadro todos los meses. */
export function porOrigen(filas: FilaDeVenta[]): FilaOrigen[] {
  const origenes: OrigenUnidad[] = ['compra', 'toma', 'consignacion'];
  return origenes.map((origen) => {
    const c = nuevaCuenta();
    for (const v of filas) if (v.origen === origen) acumular(c, v);
    return { origen, ...cerrar(c) };
  });
}

// ─── Lo que hay que mirar hoy ───────────────────────────────────────────────

export type MotivoRiesgo = 'perdida' | 'papeles' | 'parado' | 'margen_flaco' | 'sin_precio';

export interface Riesgo {
  id: string;
  numero: string;
  titulo: string;
  dominio: string | null;
  moneda: MonedaTablero;
  dias: number;
  costo: number;
  precio: number | null;
  margen: number | null;
  margen_pct: number | null;
  /** Todo lo que le pasa a esa unidad, de lo más grave a lo menos. */
  motivos: MotivoRiesgo[];
  severidad: 1 | 2 | 3;
}

/**
 * Las unidades que hoy están dejando (o van a dejar) plata sobre la mesa.
 * Los umbrales siguen los del resto del sistema: 60 días es «parado», 8% es un
 * margen que no aguanta un mes malo. Un auto que entró esta semana no es un
 * problema: los papeles y el precio se cargan en los primeros días.
 */
export function riesgosDe(filas: FilaDeStock[], tope = 12): Riesgo[] {
  const out: Riesgo[] = [];
  for (const f of filas) {
    const margen = margenDeStock(f);
    const pct = margen === null || f.precio === null ? null : porcentaje(margen, f.precio);
    const motivos: MotivoRiesgo[] = [];
    if (margen !== null && margen <= 0) motivos.push('perdida');
    if (f.papeles_en_rojo && f.dias >= 10) motivos.push('papeles');
    if (f.dias >= 60) motivos.push('parado');
    if (pct !== null && pct < 8 && f.dias >= 30) motivos.push('margen_flaco');
    if (margen === null && f.dias >= 7) motivos.push('sin_precio');
    if (!motivos.length) continue;
    const severidad: 1 | 2 | 3 = motivos.includes('perdida')
      ? 3
      : motivos.some((m) => m === 'papeles' || m === 'sin_precio' || m === 'parado') ? 2 : 1;
    out.push({
      id: f.id, numero: f.numero, titulo: f.titulo, dominio: f.dominio, moneda: f.moneda,
      dias: f.dias, costo: f.costo, precio: f.precio, margen, margen_pct: pct, motivos, severidad,
    });
  }
  // Lo más grave primero; a igual gravedad, lo que hace más tiempo que está parado.
  return out.sort((a, b) => b.severidad - a.severidad || b.dias - a.dias || (a.margen ?? 0) - (b.margen ?? 0)).slice(0, tope);
}

/** Los que hace más tiempo que están en la playa: el capital que no rota. */
export function masParados(filas: FilaDeStock[], tope = 8): FilaDeStock[] {
  return [...filas].filter((f) => f.dias >= 30).sort((a, b) => b.dias - a.dias).slice(0, tope);
}
