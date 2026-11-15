/**
 * Staging (spec 2026-10-28 §4): su base es una rama de Neon creada desde
 * producción, así que trae las credenciales reales. Sin sanear, un pago de
 * prueba en staging cobraría de verdad. OJO: pisa los tokens sin guardarlos;
 * corrido sobre producción, habría que reconectar Mercado Libre y volver a
 * cargar el token de Mercado Pago. Por eso `urlDeStaging` es estricta.
 */
export interface SentenciaDeSaneo {
  que: string;
  sql: string;
}

export function sentenciasDeSaneo(): SentenciaDeSaneo[] {
  return [
    { que: 'Mercado Pago en modo demo', sql: `UPDATE company SET mp_access_token = 'SIMULADO' WHERE mp_access_token IS NOT NULL` },
    {
      que: 'Mercado Pago sin conexión OAuth',
      sql: `UPDATE company SET mp_refresh_token = NULL, mp_user_id = NULL, mp_cuenta = NULL, mp_token_vence = NULL, mp_conectado_en = NULL`,
    },
    {
      que: 'Mercado Libre sin credenciales',
      sql: `UPDATE conexiones_ml SET access_token = '', refresh_token = '', ultimo_error = 'Staging: sin credenciales de Mercado Libre'`,
    },
  ];
}

/**
 * La base a sanear sale SÓLO de `STAGING_DATABASE_URL`, nunca de
 * `DATABASE_URL` (que en el .env del repo es la de producción).
 */
/** El endpoint de Neon (`ep-…`) de una URL, sin `-pooler`: la misma base escrita de dos formas da el mismo. */
function endpointDe(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '');
  } catch {
    return null;
  }
}

export function urlDeStaging(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string {
  const url = env.STAGING_DATABASE_URL?.trim();
  if (!url) throw new Error('Falta STAGING_DATABASE_URL: la URL de la rama staging de Neon');
  const prod = env.DATABASE_URL?.trim();
  if (url === prod || (endpointDe(url) !== null && endpointDe(url) === endpointDe(prod))) throw new Error('STAGING_DATABASE_URL apunta a la misma base que DATABASE_URL: esa es la de producción, no se sanea');
  return url;
}
