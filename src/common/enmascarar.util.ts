/**
 * Enmascarador central de datos personales y secretos (integridad 14/10).
 *
 * Dos usos:
 * - `enmascararCampo`: el valor de un campo conocido (auditoría de clientes:
 *   «teléfono: •••• 834 → •••• 912»). Se ve que cambió y se reconoce el dato
 *   sin dejarlo entero en una tabla que lee cualquier admin.
 * - `enmascararTexto`: un texto libre que va a un log (mensajes de error de
 *   servicios externos, cuerpos de respuesta, descartes de la trampa para
 *   bots). Tapa correos, tiras largas de dígitos (DNI, CUIT, teléfono, CBU,
 *   tarjeta), tokens de MP/ML y `Bearer ...`.
 */

const CAMPOS_TELEFONO = new Set(['telefono', 'telefono_alternativo', 'celular', 'whatsapp']);
const CAMPOS_DOCUMENTO = new Set(['documento', 'dni', 'cuit', 'cuil', 'cbu', 'alias_cbu', 'numero_documento']);
const CAMPOS_EMAIL = new Set(['email', 'correo', 'mail']);
const CAMPOS_DIRECCION = new Set(['direccion_principal', 'direccion', 'piso_depto', 'referencia_domicilio', 'notas_entrega']);
const CAMPOS_SECRETOS = new Set([
  'password', 'clave', 'token', 'access_token', 'refresh_token', 'mp_access_token', 'mp_refresh_token', 'tokenversion', 'token_version', 'secret',
]);

const soloDigitos = (s: string) => s.replace(/\D/g, '');

/** `•••• 834`: los últimos 3 dígitos, nada más. */
export function enmascararNumero(valor: string): string {
  const d = soloDigitos(valor);
  return d.length >= 3 ? `•••• ${d.slice(-3)}` : '••••';
}

/** `ma•••@gmail.com`. */
export function enmascararEmail(valor: string): string {
  const [usuario, dominio] = valor.split('@');
  if (!dominio) return '••••';
  return `${usuario.slice(0, 2)}•••@${dominio}`;
}

/** El valor de un campo, tapado según qué es. Lo que no es sensible pasa igual. */
export function enmascararCampo(campo: string, valor: unknown): unknown {
  if (valor === null || valor === undefined || valor === '') return valor ?? null;
  const c = campo.toLowerCase();
  if (CAMPOS_SECRETOS.has(c)) return '••••';
  const texto = String(valor);
  if (CAMPOS_TELEFONO.has(c) || CAMPOS_DOCUMENTO.has(c)) return enmascararNumero(texto);
  if (CAMPOS_EMAIL.has(c)) return enmascararEmail(texto);
  if (CAMPOS_DIRECCION.has(c)) return '(dirección)';
  return valor;
}

/**
 * Un texto libre para el log. No pretende ser perfecto: tapa lo que tiene
 * forma de dato personal o de credencial.
 */
export function enmascararTexto(texto: unknown): string {
  return String(texto ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ••••')
    .replace(/\b(APP_USR|TEST)-[A-Za-z0-9-]{8,}/g, '$1-••••')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => enmascararEmail(m))
    // 7 o más dígitos seguidos, con separadores comunes: DNI, CUIT, teléfono, CBU, tarjeta.
    // No si vienen pegados a una letra y guion (OS-2026-0042 es un número de orden).
    .replace(/(?<![\w-])\+?\d(?:[\d .-]{5,}\d)/g, (m) => (soloDigitos(m).length >= 7 ? enmascararNumero(m) : m));
}

/** Los campos de un objeto plano, cada uno tapado según su nombre (para logs de formularios). */
export function enmascararObjeto(datos: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, typeof v === 'string' ? enmascararTexto(enmascararCampo(k, v)) : enmascararCampo(k, v)]));
}
