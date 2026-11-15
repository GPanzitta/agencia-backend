/**
 * A dónde va una reversa de billetera. Puro y testeado, porque la regla es
 * contable y no puede estar enterrada en un if de un service.
 *
 * La exigencia de caja abierta existe para garantizar que hubo una apertura
 * (y su arqueo) DESPUÉS del turno original: eso es lo que hace válido el caso
 * `sin_arqueo`. Si el movimiento original nunca perteneció a un turno, no hay
 * arqueo que proteger y la exigencia no defiende nada.
 */
export interface EntradaReversa {
  /** El turno al que pertenece el asiento original, o null si no tuvo. */
  turnoOriginalId: string | null;
  /** El turno abierto ahora, o null si no hay ninguno. */
  turnoAbiertoId: string | null;
  destino?: 'turno_actual' | 'sin_arqueo';
}

export type DecisionReversa =
  | { accion: 'escribir' }
  | { accion: 'omitir' }
  | { accion: 'error'; codigo: 'CAJA_CERRADA' | 'DESTINO_REQUERIDO' };

export function decidirReversa(entrada: EntradaReversa): DecisionReversa {
  // Sin arqueo de por medio: se escribe el contrario y listo. Si además hay un
  // turno abierto, `registrar` lo reflejará en el arqueo de hoy, que es lo
  // correcto: la plata se movió hoy.
  if (!entrada.turnoOriginalId) return { accion: 'escribir' };

  if (!entrada.turnoAbiertoId)
    return { accion: 'error', codigo: 'CAJA_CERRADA' };
  if (entrada.turnoOriginalId === entrada.turnoAbiertoId)
    return { accion: 'escribir' };

  if (!entrada.destino) return { accion: 'error', codigo: 'DESTINO_REQUERIDO' };
  return entrada.destino === 'sin_arqueo'
    ? { accion: 'omitir' }
    : { accion: 'escribir' };
}
