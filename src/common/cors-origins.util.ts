/**
 * Orígenes permitidos por CORS, compartidos entre el HTTP normal (main.ts)
 * y el gateway de WebSockets (events.gateway.ts) para que ambos usen
 * exactamente la misma política.
 *
 * Se arma con los dominios de desarrollo hardcodeados de siempre más los
 * que lleguen por la variable de entorno CORS_ORIGINS (lista separada por
 * comas), pensada para los dominios de producción/demo (Vercel, etc.) sin
 * tener que tocar código en cada deploy.
 *
 * SEG-12: los de desarrollo (localhost) sólo cuando STAGE no es `prod`. En
 * producción, con `credentials: true`, cualquier cosa que corra en el
 * localhost:4300 de la máquina de un empleado podía leer respuestas con la
 * sesión del ERP.
 */

const ORIGENES_DEV = [
  'http://localhost:4400', // ERP (dev)
  'http://localhost:3201', // sitio (dev)
];

export function obtenerOrigenesCors(env: NodeJS.ProcessEnv = process.env): string[] {
  const extra = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origen) => origen.trim())
    .filter(Boolean);

  const dev = env.STAGE === 'prod' ? [] : ORIGENES_DEV;
  return [...dev, ...extra];
}
