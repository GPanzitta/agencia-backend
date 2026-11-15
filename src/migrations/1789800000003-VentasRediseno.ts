import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rediseño del módulo de ventas del ERP (spec 2026-09-21): fechas de cierre
 * de la venta (cancelada / devuelta, para la línea de tiempo del cajón) y la
 * marca de "ya se avisó" del pedido de la tienda (grupo Para avisar).
 * Sólo columnas nullable, sin backfill: las filas viejas quedan en null y el
 * ERP dice "sin fecha registrada".
 */
export class VentasRediseno1789800000003 implements MigrationInterface {
  name = 'VentasRediseno1789800000003';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ventas_tienda" ADD "cancelado_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`ALTER TABLE "ventas_tienda" ADD "devuelto_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`ALTER TABLE "pedidos_tienda" ADD "avisado_en" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "pedidos_tienda" DROP COLUMN "avisado_en"`);
    await q.query(`ALTER TABLE "ventas_tienda" DROP COLUMN "devuelto_at"`);
    await q.query(`ALTER TABLE "ventas_tienda" DROP COLUMN "cancelado_at"`);
  }
}
