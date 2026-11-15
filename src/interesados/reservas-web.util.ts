import type { EstadoReservaWeb } from './reserva-web.entity';

/** Reglas puras de la reserva desde el sitio (13/11/2026). */

/** Con qué condiciones toma reservas el sitio de una agencia. */
export interface ReservaDelSitio {
  monto: number;
  moneda: 'ARS' | 'USD';
  /** Horas que tiene el cliente para transferir la seña. */
  horas: number;
  /** Días que se le guarda el auto una vez confirmada. */
  dias: number;
  /** Alias o CBU al que transfiere. */
  alias: string;
  titular: string;
}

/** Un pedido pendiente al que se le pasó el plazo ya no frena a nadie: cuenta como vencido. */
export function estadoVigente(estado: EstadoReservaWeb, venceAt: Date | string, ahora: Date = new Date()): EstadoReservaWeb {
  return estado === 'pendiente' && new Date(venceAt).getTime() < ahora.getTime() ? 'vencida' : estado;
}

/** AAAA-MM-DD más N días. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}

/** null si la configuración sirve; si no, qué le falta. */
export function problemaDeReserva(r: Partial<ReservaDelSitio>): string | null {
  if (!(Number(r.monto) > 0)) return 'Decí de cuánto es la seña.';
  if (r.moneda !== 'ARS' && r.moneda !== 'USD') return 'Elegí si la seña es en pesos o en dólares.';
  if (!(r.alias ?? '').trim()) return 'Cargá el alias o CBU donde el cliente transfiere la seña.';
  if (!(r.titular ?? '').trim()) return 'Cargá a nombre de quién está la cuenta: el cliente lo ve antes de transferir.';
  return null;
}

/** Sólo los dígitos: dos teléfonos escritos distinto son el mismo. */
export function soloDigitos(v: string | null | undefined): string {
  return (v ?? '').split('').filter((c) => c >= '0' && c <= '9').join('');
}
