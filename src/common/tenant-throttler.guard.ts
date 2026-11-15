import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { agruparIp } from './tope-intentos.util';

/**
 * Las Server Actions del portal (carrito, compra, comprobante) llegan desde el
 * servidor de Vercel: todos los visitantes con la misma IP, compartiendo un
 * límite pensado para una persona. El portal manda la IP real del visitante
 * firmada con `PORTAL_CLAVE`; sólo con la clave correcta se le cree. Sin la
 * variable, o con una clave que no coincide, cuenta la IP de la conexión.
 */
export function visitanteDelPortal(req: Request): string | null {
  const clave = process.env.PORTAL_CLAVE;
  const enviada = req.headers['x-portal-clave'];
  const ip = req.headers['x-visitante-ip'];
  if (!clave || typeof enviada !== 'string' || typeof ip !== 'string') return null;
  const a = Buffer.from(enviada);
  const b = Buffer.from(clave);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const limpia = ip.trim().slice(0, 64);
  return limpia ? `visitante:${agruparIp(limpia)}` : null;
}

/**
 * El guard de rate limit de toda la app, con una corrección sobre el login.
 *
 * Por defecto el conteo es por IP. En un taller todas las terminales salen por
 * la misma IP pública, así que el límite anti fuerza bruta del login (5 por
 * minuto) se lo repartían entre todos: al entrar los seis puestos en el cambio
 * de turno, el último quedaba bloqueado un minuto sin haber fallado nada. Se
 * reprodujo en la demo — el sexto login de corrido devolvía 429.
 *
 * En el login se cuenta por **email + IP**: un atacante probando claves contra
 * UNA cuenta sigue topando a los 5 intentos por minuto, pero los compañeros ya
 * no se estorban entre sí. El resto de las rutas sigue contando por IP, que es
 * lo correcto para un techo global de abuso.
 *
 * Va como guard global (APP_GUARD) y no como decorador de ruta a propósito: el
 * `ThrottlerGuard` global lee la misma metadata de `@Throttle`, así que un
 * guard extra sobre el handler no evita que el global cuente primero por IP —
 * que fue exactamente por lo que el primer intento de arreglo no funcionó.
 */
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const directa = req.ip ?? req.ips?.[0];
    const ip = visitanteDelPortal(req) ?? (directa ? agruparIp(directa) : 'sin-ip');

    // SEG-54: el cambio de clave se cuenta por SESIÓN (el token, hasheado):
    // por IP se lo repartirían todas las terminales del taller, y el que
    // prueba claves actuales con un token robado topa igual a los 5.
    if (typeof req.url === 'string' && req.url.includes('/auth/cambiar-clave')) {
      const auth = String(req.headers?.authorization ?? '');
      const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
      return token ? `clave:${createHash('sha256').update(token).digest('hex').slice(0, 32)}` : `clave:sin-token:${ip}`;
    }

    const esLogin = typeof req.url === 'string' && req.url.includes('/auth/login');
    if (!esLogin) return ip;

    // El email se normaliza para que no se esquive el límite alternando
    // mayúsculas o metiendo espacios.
    const email = String((req.body as { email?: unknown } | undefined)?.email ?? '')
      .trim()
      .toLowerCase()
      .slice(0, 200); // SEG-38: la clave del contador en memoria no crece con lo que mande el cliente

    // Sin email el request no es un login válido; se cuenta por IP para no
    // dejar un agujero por el que pasar sin límite.
    return email ? `login:${email}:${ip}` : `login:sin-email:${ip}`;
  }
}
