/**
 * Tope para los `?limite=` / `?limit=` sueltos (SEG-36). Sin esto,
 * `?limite=10000000` traía la tabla entera de una (con relaciones), y
 * `?limite=abc` daba NaN y llegaba así a `take`. El ERP pide 20, 50 o 100.
 */
export const LIMITE_MAXIMO = 500;

export function limiteSeguro(valor: unknown, porDefecto: number, maximo = LIMITE_MAXIMO): number {
  const n = typeof valor === 'number' ? valor : parseInt(String(valor ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return porDefecto;
  return Math.min(Math.floor(n), maximo);
}
