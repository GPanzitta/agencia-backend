import type { Moneda } from './entities/unidad.entity';
import type { EstadoOperacion } from './entities/operacion.entity';
import { Importe, convertir, sumar } from './unidades.util';

/** Reglas puras de la operación de venta (diseño del 12/11/2026). */

/** Menos que esto de diferencia se considera saldado (redondeos del tipo de cambio). */
export const TOLERANCIA_SALDO = 1;

export interface Cuenta {
  pagado: number;
  saldo: number;
  saldada: boolean;
}

/** Cuánto entró y cuánto falta, todo en la moneda de la operación. */
export function cuenta(precio: number | string, moneda: Moneda, pagos: Importe[]): Cuenta {
  const pagado = sumar(pagos, moneda);
  const saldo = Math.round((Number(precio) - pagado) * 100) / 100;
  return { pagado, saldo, saldada: saldo <= TOLERANCIA_SALDO };
}

/** null si el pago entra; si no, el motivo. */
export function problemaDelPago(pago: Importe, precio: number | string, moneda: Moneda, anteriores: Importe[]): string | null {
  if (!(Number(pago.monto) > 0)) return 'El monto tiene que ser mayor a cero.';
  const convertido = convertir(pago, moneda);
  if (convertido === null) return `El pago está en ${pago.moneda} y la operación en ${moneda}: decí a cuánto se tomó el dólar.`;
  const { saldo } = cuenta(precio, moneda, anteriores);
  if (convertido > saldo + TOLERANCIA_SALDO) return `El pago supera lo que falta cobrar (${saldo.toFixed(2)} ${moneda}).`;
  return null;
}

export type AccionOperacion = 'pagar' | 'cerrar' | 'anular';

/** Sólo una reserva viva admite pagos, cierre o anulación: una venta cerrada no se toca desde acá. */
export function puede(_accion: AccionOperacion, estado: EstadoOperacion): boolean {
  return estado === 'reservada';
}

/** Una reserva con fecha pasada: la unidad sigue guardada pero hay que decidir. */
export function reservaVencida(estado: EstadoOperacion, vence: string | null | undefined, hoy: string): boolean {
  return estado === 'reservada' && !!vence && vence < hoy;
}
