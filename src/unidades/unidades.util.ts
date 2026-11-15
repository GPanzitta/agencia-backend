import type { CondicionUnidad, EstadoUnidad, Moneda, OrigenUnidad } from './entities/unidad.entity';

/** Reglas puras de la agencia (diseño del 12/11/2026). Sin base ni reloj propio. */

const MS_DIA = 24 * 60 * 60 * 1000;
const redondear = (n: number) => Math.round(n * 100) / 100;

// ─── Dominio ────────────────────────────────────────────────────────────────

/** `ab 123 cd` → `AB123CD`. Vacío → null. */
export function normalizarDominio(valor: string | null | undefined): string | null {
  const limpio = (valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return limpio || null;
}

/** Patente argentina de auto: AAA123 (hasta 2016) o AA123AA (Mercosur). */
export function dominioValido(dominio: string): boolean {
  return /^[A-Z]{3}[0-9]{3}$/.test(dominio) || /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/.test(dominio);
}

// ─── Plata en dos monedas ───────────────────────────────────────────────────

export interface Importe {
  monto: number | string;
  moneda: Moneda;
  /** Pesos por dólar. */
  tipo_cambio?: number | string | null;
}

/** null si no se puede convertir (otra moneda y sin tipo de cambio). */
export function convertir(i: Importe, destino: Moneda): number | null {
  const monto = Number(i.monto ?? 0);
  if (i.moneda === destino) return redondear(monto);
  const tc = Number(i.tipo_cambio ?? 0);
  if (!(tc > 0)) return null;
  return redondear(destino === 'ARS' ? monto * tc : monto / tc);
}

export function sumar(importes: Importe[], destino: Moneda): number {
  return redondear(importes.reduce((s, i) => s + (convertir(i, destino) ?? 0), 0));
}

/** El motivo por el que un importe no sirve, o null. */
export function problemaDelImporte(i: Importe, monedaBase: Moneda): string | null {
  if (!(Number(i.monto) > 0)) return 'El monto tiene que ser mayor a cero.';
  if (i.moneda !== monedaBase && !(Number(i.tipo_cambio ?? 0) > 0)) {
    return `Está en ${i.moneda} y la unidad en ${monedaBase}: decí a cuánto estaba el dólar ese día.`;
  }
  return null;
}

// ─── Costo, margen y días ───────────────────────────────────────────────────

export interface UnidadParaCostos {
  origen: OrigenUnidad;
  moneda: Moneda;
  costo_adquisicion: number | string;
  precio_piso?: number | string | null;
  precio_venta?: number | string | null;
  gastos?: Importe[];
}

export function totalGastos(u: UnidadParaCostos): number {
  return sumar(u.gastos ?? [], u.moneda);
}

/** Lo que la agencia lleva puesto en la unidad. En consignación, sólo los gastos. */
export function costoTotal(u: UnidadParaCostos): number {
  const adquisicion = u.origen === 'consignacion' ? 0 : Number(u.costo_adquisicion ?? 0);
  return redondear(adquisicion + totalGastos(u));
}

/** Lo que queda para la agencia al precio dado (o al de lista). null sin precio. */
export function margen(u: UnidadParaCostos, precio: number | string | null | undefined = u.precio_venta): number | null {
  if (precio === null || precio === undefined) return null;
  const piso = u.origen === 'consignacion' ? Number(u.precio_piso ?? 0) : 0;
  return redondear(Number(precio) - piso - costoTotal(u));
}

export function diasEnStock(fechaIngreso: string | Date, hasta: string | Date): number {
  const d = Math.floor((new Date(hasta).getTime() - new Date(fechaIngreso).getTime()) / MS_DIA);
  return d < 0 ? 0 : d;
}

// ─── Estados ────────────────────────────────────────────────────────────────

export const EN_STOCK: EstadoUnidad[] = ['ingreso', 'alistaje', 'disponible'];

/** Los cambios que se hacen a mano. Reservada y vendida sólo las pone una operación. */
export function puedePasarA(actual: EstadoUnidad, nuevo: EstadoUnidad, origen: OrigenUnidad): boolean {
  if (!EN_STOCK.includes(actual) || actual === nuevo) return false;
  if (EN_STOCK.includes(nuevo) || nuevo === 'baja') return true;
  return nuevo === 'devuelta' && origen === 'consignacion';
}

export interface AltaUnidad {
  origen: OrigenUnidad;
  condicion: CondicionUnidad;
  dominio?: string | null;
  costo_adquisicion?: number | null;
  precio_piso?: number | null;
  titular_nombre?: string | null;
}

/** null si el alta tiene sentido; si no, el motivo. */
export function problemaDelAlta(a: AltaUnidad): string | null {
  const dominio = normalizarDominio(a.dominio);
  if (a.condicion === 'usado' && !dominio) return 'Un usado se carga con su dominio (patente).';
  if (dominio && !dominioValido(dominio)) return 'El dominio no tiene forma de patente argentina (AAA123 o AA123AA).';
  if (a.origen === 'consignacion' && Number(a.costo_adquisicion ?? 0) > 0) {
    return 'En consignación la agencia no paga la unidad: cargá el precio piso del dueño, no un costo.';
  }
  if (a.origen === 'consignacion' && !(a.titular_nombre ?? '').trim()) return 'Decí quién es el dueño que la deja en consignación.';
  if (a.origen !== 'consignacion' && a.precio_piso) return 'El precio piso es sólo para consignación.';
  return null;
}
