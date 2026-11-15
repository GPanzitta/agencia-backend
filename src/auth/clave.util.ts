import { randomInt } from 'crypto';

/**
 * SEG-54 (decisión del dueño, 15/10/2026): la clave mínima pasa de 6 a 10
 * caracteres para las altas nuevas y los cambios. Las claves que ya existen
 * siguen andando: el login no mira el largo.
 */
export const LARGO_MINIMO_CLAVE = 10;
/** bcrypt ignora lo que pasa de 72 bytes: más largo, la parte de más no protege nada. */
export const LARGO_MAXIMO_CLAVE = 72;

/** Sin 0/O ni 1/l/I: la provisoria se dicta o se copia a mano. */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export const LARGO_CLAVE_PROVISORIA = 12;

/**
 * La clave provisoria del reseteo: 12 caracteres al azar (`crypto.randomInt`,
 * no `Math.random`), unos 68 bits. Se le muestra UNA vez al admin y el
 * empleado la tiene que cambiar al entrar (`debe_cambiar_clave`).
 */
export function generarClaveProvisoria(largo = LARGO_CLAVE_PROVISORIA): string {
  let clave = '';
  for (let i = 0; i < largo; i++) clave += ALFABETO[randomInt(ALFABETO.length)];
  return clave;
}

/**
 * Con `debe_cambiar_clave` sólo se puede saber quién es, cambiar la clave y
 * cerrar sesión. El resto del backend responde 403 DEBE_CAMBIAR_CLAVE: la
 * provisoria la conoce el admin, y la cuenta no tiene que operar con ella.
 */
export function rutaPermitidaConClaveProvisoria(url: string | null | undefined): boolean {
  const camino = String(url ?? '').split('?')[0].replace(/\/+$/, '');
  return /\/auth\/(me|cambiar-clave|logout)$/.test(camino);
}
