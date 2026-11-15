import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Los links que salen por correo: quién y hasta cuándo, firmados. No hace falta
 * guardarlos. El propósito va en la firma, para que otra cosa firmada con el
 * mismo secreto no sirva acá. La huella ata el link a la clave de ese momento:
 * si la clave cambia, el link deja de valer.
 */
const CONFIRMAR = { proposito: 'confirmar-cuenta:', vigenciaMs: 48 * 3600 * 1000 };
const RECUPERAR = { proposito: 'recuperar-clave:', vigenciaMs: 3600 * 1000 };

export interface DatosDeEnlace { userId: string; huella: string }

type Tipo = typeof CONFIRMAR;

function firma(tipo: Tipo, carga: string, secreto: string): string {
  return createHmac('sha256', secreto).update(tipo.proposito + carga).digest('base64url');
}

export function huellaDeClave(claveHash: string | null | undefined): string {
  return createHash('sha256').update(claveHash ?? '').digest('base64url').slice(0, 16);
}

function firmar(tipo: Tipo, userId: string, claveHash: string | null | undefined, secreto: string, ahora: Date): string {
  const carga = Buffer.from(`${userId}.${ahora.getTime() + tipo.vigenciaMs}.${huellaDeClave(claveHash)}`).toString('base64url');
  return `${carga}.${firma(tipo, carga, secreto)}`;
}

function leer(tipo: Tipo, token: string, secreto: string, ahora: Date): DatosDeEnlace | null {
  const [carga, recibida, sobra] = String(token ?? '').split('.');
  if (!carga || !recibida || sobra !== undefined) return null;
  const a = Buffer.from(recibida);
  const b = Buffer.from(firma(tipo, carga, secreto));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [userId, vence, huella] = Buffer.from(carga, 'base64url').toString().split('.');
  if (!userId || !huella || !(Number(vence) > ahora.getTime())) return null;
  return { userId, huella };
}

export const firmarConfirmacion = (userId: string, claveHash: string | null | undefined, secreto: string, ahora = new Date()) =>
  firmar(CONFIRMAR, userId, claveHash, secreto, ahora);
export const leerConfirmacion = (token: string, secreto: string, ahora = new Date()) => leer(CONFIRMAR, token, secreto, ahora);
export const firmarRecuperacion = (userId: string, claveHash: string | null | undefined, secreto: string, ahora = new Date()) =>
  firmar(RECUPERAR, userId, claveHash, secreto, ahora);
export const leerRecuperacion = (token: string, secreto: string, ahora = new Date()) => leer(RECUPERAR, token, secreto, ahora);
