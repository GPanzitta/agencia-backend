import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * DAT-04 (integridad 14/10): última barrera para que ninguna respuesta lleve
 * secretos o campos internos, la arme quien la arme.
 *
 * `@Exclude` + `ClassSerializerInterceptor` sólo actúan sobre instancias de
 * entidad: un `{ ...user }`, un `getRawMany()` o un objeto armado a mano
 * pasan de largo. Acá se borran, en cualquier nivel, las claves que nunca
 * tienen que salir por HTTP: hash de clave, versión de sesión, tokens de
 * Mercado Pago y Mercado Libre, id de Google del cliente web.
 *
 * Va por FUERA del serializer (se registra antes en `main.ts`): trabaja sobre
 * lo que ya quedó como objeto plano. No toca `token` (el JWT del login) ni
 * los binarios (PDF, archivos).
 */
export const CLAVES_SECRETAS = new Set([
  'password',
  'tokenVersion',
  'token_version',
  'mp_access_token',
  'mp_refresh_token',
  'access_token',
  'refresh_token',
  'ml_access_token',
  'ml_refresh_token',
  'client_secret',
  'google_id',
]);

const PROFUNDIDAD_MAXIMA = 12;

function esPlano(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

export function sinSecretos<T>(valor: T, profundidad = 0, vistos = new WeakSet<object>()): T {
  if (profundidad > PROFUNDIDAD_MAXIMA || valor === null || typeof valor !== 'object') return valor;
  if (vistos.has(valor as object)) return valor;
  vistos.add(valor as object);
  if (Array.isArray(valor)) {
    return valor.map((v) => sinSecretos(v, profundidad + 1, vistos)) as T;
  }
  if (!esPlano(valor)) return valor;
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor)) {
    if (CLAVES_SECRETAS.has(k)) continue;
    r[k] = sinSecretos(v, profundidad + 1, vistos);
  }
  return r as T;
}

@Injectable()
export class QuitarSecretosInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => sinSecretos(data)));
  }
}
