import { Roles } from '../enums/roles.enum';
import type { CodigoError } from '../common/errores/codigos';

export interface PayloadDeSesion {
  id: string;
  companyId?: string;
  tokenVersion?: number;
  role?: string;
}

export interface UsuarioDeSesion {
  activo: boolean;
  tokenVersion: number;
  companyId?: string | null;
  role?: { nombre?: string | null } | null;
}

export interface SesionInvalida {
  code: CodigoError;
  message: string;
}

/**
 * Por qué un token ya no vale, o `null` si vale. Una sola regla para el HTTP
 * (`JwtStrategy`) y para el socket (`EventsGateway`): antes el socket sólo
 * verificaba la firma, y un empleado dado de baja seguía recibiendo en vivo
 * los eventos del taller (CLI-05).
 *
 * - Dado de baja: `USUARIO_DADO_DE_BAJA`, para que el ERP lo diga con todas
 *   las letras en vez de un «tu sesión venció» en bucle (CLI-04).
 * - Sesión revocada (cambio de rol, cerrar sesión): `SESION_VENCIDA`.
 * - Sin rol, o sin empresa sin ser superadmin: `SESION_VENCIDA`. Un usuario
 *   así no tiene contexto de empresa y el aislamiento no filtraría nada
 *   (SEG-07: que falle cerrado).
 */
export function sesionInvalida(user: UsuarioDeSesion | null | undefined, payload: PayloadDeSesion): SesionInvalida | null {
  if (!user) return { code: 'SESION_VENCIDA', message: 'La sesión ya no es válida. Volvé a entrar.' };
  if (!user.activo) {
    return { code: 'USUARIO_DADO_DE_BAJA', message: 'Tu usuario está dado de baja. Hablá con el encargado.' };
  }
  // SEG-32: un token sin `tokenVersion` no se puede revocar (cerrar sesión,
  // cambio de rol). Los de antes del campo ya vencieron en producción (5
  // días); en desarrollo no vencían nunca y quedaban como sesión eterna.
  if (payload.tokenVersion === undefined || payload.tokenVersion !== user.tokenVersion) {
    return { code: 'SESION_VENCIDA', message: 'Tu sesión se cerró. Volvé a entrar.' };
  }
  if (!user.role?.nombre) {
    return { code: 'SESION_VENCIDA', message: 'Tu usuario no tiene un puesto asignado. Hablá con el encargado.' };
  }
  if (!user.companyId && user.role.nombre !== Roles.SUPERADMIN) {
    return { code: 'SESION_VENCIDA', message: 'Tu usuario no tiene un taller asignado. Hablá con el encargado.' };
  }
  return null;
}
