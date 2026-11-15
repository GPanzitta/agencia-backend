/** Reglas puras de las comisiones por venta (13/11/2026). */

export type PorMoneda = { ARS: number; USD: number };

/** Lo que le toca al vendedor por una venta según su porcentaje; `null` si no tiene porcentaje. */
export function comisionSugerida(precio: number | string, pct: number | string | null | undefined): number | null {
  if (pct === null || pct === undefined || pct === '') return null;
  const p = Number(pct);
  if (!(p > 0)) return null;
  return Math.round(Number(precio) * p) / 100;
}

export interface VentaConComision {
  id: string;
  vendedorId: string | null;
  precio: number;
  moneda: 'ARS' | 'USD';
  comision: number | null;
  pagada: boolean;
}

export interface ResumenVendedor {
  ventas: number;
  vendido: PorMoneda;
  comision: PorMoneda;
  /** Lo ganado y todavía no pagado. */
  pendiente: PorMoneda;
}

const cero = (): PorMoneda => ({ ARS: 0, USD: 0 });
const redondo = (n: number) => Math.round(n * 100) / 100;

/** Las ventas cerradas de un período, sumadas por vendedor y por moneda (no se mezclan pesos con dólares). */
export function resumenPorVendedor(ventas: VentaConComision[]): Map<string, ResumenVendedor> {
  const mapa = new Map<string, ResumenVendedor>();
  for (const v of ventas) {
    const clave = v.vendedorId ?? '';
    const r = mapa.get(clave) ?? { ventas: 0, vendido: cero(), comision: cero(), pendiente: cero() };
    r.ventas += 1;
    r.vendido[v.moneda] = redondo(r.vendido[v.moneda] + Number(v.precio));
    const c = Number(v.comision ?? 0);
    r.comision[v.moneda] = redondo(r.comision[v.moneda] + c);
    if (!v.pagada) r.pendiente[v.moneda] = redondo(r.pendiente[v.moneda] + c);
    mapa.set(clave, r);
  }
  return mapa;
}
