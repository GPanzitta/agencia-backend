import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reposición de una orden de compra (pedido del dueño, 16/10/2026): cuando la
 * mercadería llega mal y se rechaza al recibir, el armador arma una OC nueva
 * con lo rechazado y la deja atada a la original.
 *
 * - `purchase_orders.oc_origen_id`: la OC que esta repone. Si la original se
 *   borrara, la reposición queda suelta (SET NULL), no se pierde.
 *
 * Riesgo: bajo. Columna nueva nullable (no reescribe la tabla), FK e índice
 * con `IF NOT EXISTS` / chequeo previo: se puede correr dos veces.
 */
export class ReposicionDeOC1790000000003 implements MigrationInterface {
  name = 'ReposicionDeOC1790000000003';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "oc_origen_id" uuid`);
    await q.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_purchase_orders_oc_origen') THEN
          ALTER TABLE "purchase_orders" ADD CONSTRAINT "FK_purchase_orders_oc_origen"
            FOREIGN KEY ("oc_origen_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL;
        END IF;
      END $$`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_purchase_orders_oc_origen" ON "purchase_orders" ("oc_origen_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_purchase_orders_oc_origen"`);
    await q.query(`ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "FK_purchase_orders_oc_origen"`);
    await q.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "oc_origen_id"`);
  }
}
