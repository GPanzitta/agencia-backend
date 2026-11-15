import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Primera tanda 21/10/2026 (spec 2026-10-21-primera-tanda-design).
 *
 * - `repair_orders.pagado_online` / `pago_online_mp_id`: el saldo pagado desde
 *   el link de la orden por Mercado Pago (§14). CHECK ≥ 0 como los otros montos.
 * - `repair_orders.nps_atendida_at` / `nps_atendida_por_id`: quién atendió una
 *   opinión baja y cuándo (§15). FK a users.
 * - `solicitudes_servicio.orden_origen_id`: el reclamo de garantía apunta a la
 *   orden original (§13). Si la orden se borra, el pedido queda sin origen.
 *   Índice único parcial: un solo reclamo abierto por orden.
 *
 * Riesgo: bajo. Columnas anulables sin default (no reescriben la tabla); el
 * CHECK se agrega NOT VALID y se valida aparte (las filas existentes son NULL,
 * pero así no toma el lock largo). `IF NOT EXISTS`: se puede correr dos veces.
 */
export class PrimeraTanda1790000000012 implements MigrationInterface {
  name = 'PrimeraTanda1790000000012';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "repair_orders" ADD COLUMN IF NOT EXISTS "pagado_online" numeric(12,2)`);
    await q.query(`ALTER TABLE "repair_orders" ADD COLUMN IF NOT EXISTS "pago_online_mp_id" varchar`);
    await q.query(`ALTER TABLE "repair_orders" DROP CONSTRAINT IF EXISTS "CHK_repair_orders_pagado_online"`);
    await q.query(
      `ALTER TABLE "repair_orders" ADD CONSTRAINT "CHK_repair_orders_pagado_online" CHECK ("pagado_online" >= 0) NOT VALID`,
    );
    await q.query(`ALTER TABLE "repair_orders" VALIDATE CONSTRAINT "CHK_repair_orders_pagado_online"`);

    await q.query(`ALTER TABLE "repair_orders" ADD COLUMN IF NOT EXISTS "nps_atendida_at" timestamptz`);
    await q.query(`ALTER TABLE "repair_orders" ADD COLUMN IF NOT EXISTS "nps_atendida_por_id" uuid`);
    await q.query(`ALTER TABLE "repair_orders" DROP CONSTRAINT IF EXISTS "FK_repair_orders_nps_atendida_por"`);
    await q.query(
      `ALTER TABLE "repair_orders" ADD CONSTRAINT "FK_repair_orders_nps_atendida_por" FOREIGN KEY ("nps_atendida_por_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );

    await q.query(`ALTER TABLE "solicitudes_servicio" ADD COLUMN IF NOT EXISTS "orden_origen_id" uuid`);
    await q.query(`ALTER TABLE "solicitudes_servicio" DROP CONSTRAINT IF EXISTS "FK_solicitudes_servicio_orden_origen"`);
    await q.query(
      `ALTER TABLE "solicitudes_servicio" ADD CONSTRAINT "FK_solicitudes_servicio_orden_origen" FOREIGN KEY ("orden_origen_id") REFERENCES "repair_orders"("id") ON DELETE SET NULL`,
    );
    // El portal pregunta «¿ya hay un reclamo abierto de esta orden?» en cada vista.
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_solicitudes_servicio_orden_origen" ON "solicitudes_servicio" ("orden_origen_id") WHERE "orden_origen_id" IS NOT NULL`,
    );
    // Un reclamo de garantía abierto por orden (`hayReclamoAbierto`): dos
    // clics a la vez pasaban los dos el chequeo y dejaban dos pedidos. El
    // segundo choca acá (23505) y el portal responde RECLAMO_YA_ENVIADO.
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_solicitudes_servicio_reclamo_abierto" ON "solicitudes_servicio" ("orden_origen_id") ` +
        `WHERE "orden_origen_id" IS NOT NULL AND ("estado" = 'nuevo' OR ("estado" = 'aceptado' AND "orden_id" IS NULL))`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "UQ_solicitudes_servicio_reclamo_abierto"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_solicitudes_servicio_orden_origen"`);
    await q.query(`ALTER TABLE "solicitudes_servicio" DROP CONSTRAINT IF EXISTS "FK_solicitudes_servicio_orden_origen"`);
    await q.query(`ALTER TABLE "solicitudes_servicio" DROP COLUMN IF EXISTS "orden_origen_id"`);

    await q.query(`ALTER TABLE "repair_orders" DROP CONSTRAINT IF EXISTS "FK_repair_orders_nps_atendida_por"`);
    await q.query(`ALTER TABLE "repair_orders" DROP COLUMN IF EXISTS "nps_atendida_por_id"`);
    await q.query(`ALTER TABLE "repair_orders" DROP COLUMN IF EXISTS "nps_atendida_at"`);

    await q.query(`ALTER TABLE "repair_orders" DROP CONSTRAINT IF EXISTS "CHK_repair_orders_pagado_online"`);
    await q.query(`ALTER TABLE "repair_orders" DROP COLUMN IF EXISTS "pago_online_mp_id"`);
    await q.query(`ALTER TABLE "repair_orders" DROP COLUMN IF EXISTS "pagado_online"`);
  }
}
