import * as fs from 'fs';
import * as path from 'path';

/**
 * Carga del .env para los specs de integración contra la base.
 *
 * Ojo: el .env de este repo apunta a PRODUCCIÓN (Neon) y el cliente usa el
 * sistema, así que un spec no puede conectarse ahí por accidente. Dos
 * resguardos:
 *  1. Una variable que YA está en process.env (aunque venga vacía, como
 *     `DATABASE_URL=` para apagar la base) no se pisa con la del .env.
 *  2. Si la DATABASE_URL termina apuntando a *.neon.tech, los tests de base se
 *     saltean, salvo que se pida explícitamente con PERMITIR_TESTS_EN_PROD=1.
 */

/** true si la URL es de producción (host *.neon.tech) o no se puede parsear. */
export function esBaseDeProduccion(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.toLowerCase().endsWith('.neon.tech');
  } catch {
    return true; // no se entiende la URL: por las dudas, se trata como insegura
  }
}

/** Parsea el contenido de un .env y setea solo lo que no está presente. */
export function aplicarEnv(
  contenido: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  contenido.split(/\r?\n/).forEach((l) => {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].trim();
  });
}

/** Carga el .env y devuelve si corresponde correr los tests de base. */
export function hayBaseParaTests(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const envPath = path.resolve(__dirname, '../../../.env');
  if (fs.existsSync(envPath)) aplicarEnv(fs.readFileSync(envPath, 'utf8'), env);
  if (!env.DATABASE_URL) return false;
  if (esBaseDeProduccion(env.DATABASE_URL) && env.PERMITIR_TESTS_EN_PROD !== '1')
    return false;
  return true;
}
