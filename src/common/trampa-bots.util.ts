import { Logger } from '@nestjs/common';

/**
 * Pendiente del portal (POR-06, 13/10/2026): los tres formularios públicos
 * (pedido de servicio, pedido de la tienda y arrepentimiento) descartaban sin
 * dejar rastro lo que caía en la trampa para bots. Al bot se le sigue
 * respondiendo lo mismo que a una persona; lo que cambia es que el descarte
 * queda en el log, para poder revisar un falso positivo (un gestor de
 * contraseñas que llenó el campo escondido). En el arrepentimiento hay riesgo
 * legal: se anota el correo y el pedido para poder contactar a la persona.
 */
const logger = new Logger('TrampaBots');

export function registrarDescarte(
  formulario: 'solicitud_servicio' | 'pedido_tienda' | 'arrepentimiento' | 'alta_taller',
  empresaId: string | null | undefined,
  datos: Record<string, string | null | undefined> = {},
): void {
  const limpio = Object.fromEntries(
    Object.entries(datos)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => [k, String(v).slice(0, 120)]),
  );
  logger.warn(`Descartado por la trampa para bots: ${JSON.stringify({ formulario, empresaId: empresaId ?? null, ...limpio })}`);
}
