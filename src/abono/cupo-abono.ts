import type { EntityManager } from 'typeorm';
import { ErrorDeNegocio } from '../common/errores/error-negocio';

/** Las órdenes que gastan cupo este mes: las importadas ya existían en otro sistema. */
export async function ordenesDelMes(em: Pick<EntityManager, 'query'>, companyId: string): Promise<number> {
  // Agencia (12/11/2026): el plan gratis se mide en unidades en stock a la vez, no en órdenes por mes.
  // El nombre de la función y el de la columna del tope se conservan para no migrar la configuración.
  const filas = await em.query(
    `SELECT count(*)::int AS n FROM "unidades"
      WHERE "company_id" = $1 AND "estado" IN ('ingreso', 'alistaje', 'disponible', 'reservada')`,
    [companyId],
  );
  return filas?.[0]?.n ?? 0;
}

/**
 * Frena el alta si el plan gratis ya llegó a su tope (spec 2026-10-28 §7).
 *
 * Va con SQL directo sobre el `em` de la transacción del alta, y se llama con el
 * lock de la numeración ya tomado: así dos mostradores a la vez no lo superan.
 */
export async function exigirCupo(em: Pick<EntityManager, 'query'>, companyId: string): Promise<void> {
  const empresa = await em.query(`SELECT "plan" FROM "company" WHERE "id" = $1`, [companyId]);
  if (empresa?.[0]?.plan !== 'gratis') return;

  const config = await em.query(`SELECT "tope_ordenes_gratis" FROM "plataforma_config" WHERE "id" = 1`);
  const tope: number = config[0].tope_ordenes_gratis;
  const usadas = await ordenesDelMes(em, companyId);
  if (usadas >= tope) {
    throw new ErrorDeNegocio(
      'TOPE_PLAN_GRATIS',
      `El plan gratis permite hasta ${tope} ${tope === 1 ? 'unidad' : 'unidades'} en stock y ya tenés ${usadas}. Vendé o dá de baja alguna, o pasate al plan pago.`,
      { tope, usadas },
    );
  }
}
