import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLA-01 (auditoría 13/10/2026): un mismo pago de Mercado Pago no puede cobrar
 * dos ventas. El webhook ya coteja que el pago sea de la venta (referencia y
 * monto), pero esta es la red de la base: si algún camino futuro se olvida del
 * chequeo, el segundo asiento con el mismo `mp_payment_id` rebota en vez de
 * acreditar dos veces la misma plata.
 *
 * Parcial: los cobros de mostrador no tienen pago de MP (null) y son muchos
 * por venta.
 *
 * Antes de crear el índice se cuenta si ya hay duplicados: si los hay, la
 * migración falla con la lista para conciliarlos a mano, en vez de un error
 * críptico de Postgres a mitad del deploy.
 */
export class CobroMpUnicoPorPago1789800000016 implements MigrationInterface {
  name = 'CobroMpUnicoPorPago1789800000016';

  public async up(q: QueryRunner): Promise<void> {
    const repetidos: { mp_payment_id: string; cobros: string }[] = await q.query(`
      SELECT "mp_payment_id", count(*)::text AS "cobros"
        FROM "venta_cobros"
       WHERE "mp_payment_id" IS NOT NULL
       GROUP BY "mp_payment_id"
      HAVING count(*) > 1`);
    if (repetidos.length) {
      throw new Error(
        'Hay pagos de Mercado Pago asentados en más de un cobro de venta; conciliarlos antes de migrar: ' +
          repetidos.map((r) => `${r.mp_payment_id} (${r.cobros})`).join(', '),
      );
    }
    await q.query(
      `CREATE UNIQUE INDEX "UQ_venta_cobros_mp_payment" ON "venta_cobros" ("mp_payment_id") WHERE "mp_payment_id" IS NOT NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "UQ_venta_cobros_mp_payment"`);
  }
}
