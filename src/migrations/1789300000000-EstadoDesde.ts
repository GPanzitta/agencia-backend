import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tanda 3 de visibilidad (14/09/2026): la orden guarda desde cuándo está en
 * su estado. Antes salía de `updated_at`, que cambia con cualquier guardado
 * (ubicación, cobertura, encuesta) y reiniciaba la antigüedad, el abandono y
 * la fecha de entrega del export B2B.
 *
 * Backfill: el último evento que llevó la orden a su estado actual; si no hay
 * (órdenes anteriores a la bitácora), `updated_at`.
 */
export class EstadoDesde1789300000000 implements MigrationInterface {
  name = 'EstadoDesde1789300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "repair_orders" ADD "estado_desde" TIMESTAMP WITH TIME ZONE`);
    await q.query(`
      UPDATE "repair_orders" o
      SET "estado_desde" = COALESCE(
        (SELECT MAX(e."fecha") FROM "repair_order_events" e WHERE e."order_id" = o."id" AND e."a" = o."estado"),
        o."updated_at"
      )
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "repair_orders" DROP COLUMN "estado_desde"`);
  }
}
