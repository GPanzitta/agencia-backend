import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Visita técnica (spec 2026-09-23): qué hizo el técnico, que hasta ahora no
 * tenía dónde guardarse — `diagnostico` es qué encontró, no qué resolvió. En
 * el taller el trabajo se deduce de los repuestos y del QA; una reparación en
 * domicilio no deja ese rastro y el cliente recibe este texto como único
 * comprobante. Nullable y sin backfill: las órdenes viejas quedan en null.
 */
export class VisitaTecnica1789800000004 implements MigrationInterface {
  name = 'VisitaTecnica1789800000004';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "repair_orders" ADD "trabajo_realizado" text`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "repair_orders" DROP COLUMN "trabajo_realizado"`);
  }
}
