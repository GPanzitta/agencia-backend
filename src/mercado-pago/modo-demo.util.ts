/**
 * ¿Este entorno deja confirmar pagos simulados? (PLA-02, auditoría 13/10)
 *
 * El modo demo de Mercado Pago se prendía sólo por el VALOR del token de la
 * empresa (`'SIMULADO'`). La copia local se sacó de producción con ese valor,
 * así que si producción lo tiene, cualquiera marcaba como pagada una venta
 * con un POST público y sin pagar. Ahora el token sólo no alcanza: el entorno
 * tiene que ser de desarrollo, o el dueño tiene que haber prendido la demo a
 * propósito con `MP_PAGO_SIMULADO=habilitado` (una instancia de demostración).
 *
 * Puro y con el entorno inyectable, para testearlo sin tocar `process.env`.
 *
 * SEG-33: falla CERRADO. Antes bastaba con que STAGE no fuera `prod`: si en
 * Render faltaba la variable o decía `production`, la demo se prendía sola.
 * Ahora hace falta decir explícitamente que es desarrollo (`dev`/`test`).
 */
const STAGES_DE_DESARROLLO = new Set(['dev', 'development', 'test', 'local']);

export function pagoSimuladoHabilitado(env: NodeJS.ProcessEnv = process.env): boolean {
  return STAGES_DE_DESARROLLO.has(env.STAGE ?? '') || env.MP_PAGO_SIMULADO === 'habilitado';
}

/**
 * ¿El taller cobra online con este token? Uno real, sí; el de la demo, sólo
 * donde la demo vale. Un 'SIMULADO' fuera de la demo es como no tener MP: la
 * tienda no ofrece pago online y el portal deja aprobar sin seña.
 */
export function mpUtilizable(accessToken: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!accessToken) return false;
  return accessToken !== 'SIMULADO' || pagoSimuladoHabilitado(env);
}

/** El token del taller es el de la demo Y el entorno la permite. */
export function demoDePagoActiva(accessToken: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  return accessToken === 'SIMULADO' && pagoSimuladoHabilitado(env);
}
