import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * El `state` de OAuth firmado (M1 §5.2). El callback de ML es público (el
 * navegador vuelve de ML sin JWT): sin una firma, un link armado por un
 * tercero podría conectar SU cuenta de ML a TU taller. Acá viaja la empresa,
 * un nonce y el vencimiento, firmados con el secreto de la app.
 */
export const STATE_VIGENCIA_MS = 10 * 60_000;

function firma(carga: string, secreto: string): string {
  return createHmac('sha256', secreto).update(carga).digest('base64url');
}

export function firmarState(companyId: string, secreto: string, ahora = new Date()): string {
  const vence = ahora.getTime() + STATE_VIGENCIA_MS;
  const carga = Buffer.from(`${companyId}|${randomBytes(8).toString('hex')}|${vence}`).toString('base64url');
  return `${carga}.${firma(carga, secreto)}`;
}

export function leerState(state: string, secreto: string, ahora = new Date()): { companyId: string; nonce: string } | null {
  const [carga, recibida] = state.split('.');
  if (!carga || !recibida) return null;
  const esperada = firma(carga, secreto);
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [companyId, nonce, vence] = Buffer.from(carga, 'base64url').toString().split('|');
  if (!companyId || !nonce || !(Number(vence) > ahora.getTime())) return null;
  return { companyId, nonce };
}
