/**
 * SEG-01 (auditoría de seguridad 13/10/2026): el seed le ponía al superadmin
 * `admin123456` si faltaba `ADMIN_PASSWORD`, y el `.env` de ejemplo traía la
 * misma clave. En producción eso es un superadmin con la clave del repo.
 *
 * Fuera de producción el default sigue (la copia local y las cuentas demo lo
 * usan). Con `STAGE=prod` el seed se niega a correr sin un correo y una clave
 * explícitos, y rechaza las claves que circulan en el repo o son cortas.
 */

/** Claves que figuran en el repo, en ejemplos o en documentación: nunca valen en producción. */
export const CLAVES_CONOCIDAS = [
  'admin123456',
  'user123456',
  'admin',
  'cambiar-por-una-clave-nueva',
  '12345678',
  '123456789012',
  'password',
] as const;

export const LARGO_MINIMO_PROD = 12;

export interface CredencialesDelSeed {
  email: string;
  password: string;
  /** De dónde salió la clave, para el log (nunca la clave). */
  origen: string;
}

export class SeedInseguroError extends Error {}

export function credencialesDelSeed(env: Record<string, string | undefined>): CredencialesDelSeed {
  const prod = env.STAGE === 'prod';
  const email = env.ADMIN_EMAIL?.trim();
  const password = env.ADMIN_PASSWORD;

  if (!prod) {
    return {
      email: email || 'admin@taller.local',
      password: password || 'admin123456',
      origen: password ? 'ADMIN_PASSWORD del .env' : 'default admin123456 (sólo desarrollo)',
    };
  }

  const faltan = [!email && 'ADMIN_EMAIL', !password && 'ADMIN_PASSWORD'].filter(Boolean);
  if (faltan.length) {
    throw new SeedInseguroError(
      `STAGE=prod: falta ${faltan.join(' y ')}. El seed no usa valores por defecto en producción.`,
    );
  }
  if (password!.length < LARGO_MINIMO_PROD) {
    throw new SeedInseguroError(
      `STAGE=prod: ADMIN_PASSWORD tiene que tener al menos ${LARGO_MINIMO_PROD} caracteres.`,
    );
  }
  if ((CLAVES_CONOCIDAS as readonly string[]).includes(password!.toLowerCase())) {
    throw new SeedInseguroError('STAGE=prod: ADMIN_PASSWORD es una clave conocida (está en el repo o en un ejemplo).');
  }
  return { email: email!, password: password!, origen: 'ADMIN_PASSWORD del entorno' };
}
