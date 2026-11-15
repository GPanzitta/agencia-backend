/**
 * Reglas del abono (spec 2026-10-28 §7). Funciones puras.
 *
 * El estado no se guarda: se calcula con el plan, el vencimiento y los días de
 * gracia. Así ninguna tarea programada tiene que despertar la base todos los
 * días para pasar talleres de un estado a otro.
 */
export type PlanTaller = 'gratis' | 'pago' | 'interno';
export type EstadoAbono = 'al_dia' | 'vencida' | 'solo_lectura';

const DIA_MS = 24 * 60 * 60 * 1000;

export function graciaHasta(vence: Date, diasGracia: number): Date {
  return new Date(vence.getTime() + diasGracia * DIA_MS);
}

export function estadoAbono(
  taller: { plan: PlanTaller; abono_vence_en?: Date | null },
  ahora: Date,
  diasGracia: number,
): EstadoAbono {
  if (taller.plan !== 'pago') return 'al_dia';
  // Un plan pago sin fecha no debería existir (el panel la exige): falla cerrado.
  if (!taller.abono_vence_en) return 'solo_lectura';
  const vence = new Date(taller.abono_vence_en);
  if (ahora.getTime() <= vence.getTime()) return 'al_dia';
  if (ahora.getTime() <= graciaHasta(vence, diasGracia).getTime()) return 'vencida';
  return 'solo_lectura';
}

/** Un mes después; si ese mes no tiene ese día, el último del mes (31/01 → 28/02). */
export function sumarUnMes(desde: Date): Date {
  const resultado = new Date(desde);
  const dia = resultado.getUTCDate();
  resultado.setUTCDate(1);
  resultado.setUTCMonth(resultado.getUTCMonth() + 1);
  const ultimoDelMes = new Date(
    Date.UTC(resultado.getUTCFullYear(), resultado.getUTCMonth() + 1, 0),
  ).getUTCDate();
  resultado.setUTCDate(Math.min(dia, ultimoDelMes));
  return resultado;
}

/**
 * Lo que el personal todavía puede hacer en sólo lectura, además de consultar.
 *
 * El spec frena el uso nuevo (crear órdenes, ventas, compras), no cerrar lo que
 * ya está en curso: si no, el chofer no rinde lo cobrado, el cliente no retira el
 * equipo que pagó y una transferencia recibida no se confirma (§7 y §13.2).
 */
const RUTAS_PERMITIDAS = [
  // Salir del paso.
  /^\/api\/abono\/.+$/,
  // La sesión, y sacarle el acceso a quien ya no trabaja en el taller.
  /^\/api\/auth\/(cambiar-clave|logout)$/,
  /^\/api\/auth\/usuarios\/[^/]+\/(activo|resetear-clave)$/,
  // Sin esto, sus clientes se quedan sin pago online si vence el token.
  /^\/api\/mp\/oauth\/(iniciar|confirmar)$/,
  // Cerrar lo que ya está en curso.
  /^\/api\/cash-register\/(open|[^/]+\/close)$/,
  // Agencia: terminar la venta que ya está reservada (cobrar, cerrar o anular), poner sus papeles
  // al día y seguir a los interesados que ya consultaron. No entra stock nuevo ni reservas nuevas.
  /^\/api\/operaciones\/[^/]+\/(pagos|cerrar|anular)$/,
  /^\/api\/unidades\/[^/]+\/papeles\/[^/]+$/,
  /^\/api\/interesados\/[^/]+\/(etapa|notas|cotizacion)$/,
];

export function rutaPermitidaEnSoloLectura(url: string | null | undefined): boolean {
  const camino = String(url ?? '').split('?')[0].replace(/\/+$/, '');
  return RUTAS_PERMITIDAS.some((ruta) => ruta.test(camino));
}
