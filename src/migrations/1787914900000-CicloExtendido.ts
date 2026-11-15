import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T4 — Ciclo extendido: reincidencias/garantías y abandono.
 * Toda reincidencia queda vinculada a su orden origen; la garantía marca el
 * reingreso sin cargo; el umbral de abandono es configurable por taller.
 */
export class CicloExtendido1787914900000 implements MigrationInterface {
  name = 'CicloExtendido1787914900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "repair_orders" ADD "orden_origen_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "repair_orders" ADD CONSTRAINT "FK_repair_orders_orden_origen"
       FOREIGN KEY ("orden_origen_id") REFERENCES "repair_orders"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "repair_orders" ADD "es_garantia" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "company" ADD "dias_abandono" integer NOT NULL DEFAULT 30`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "company" DROP COLUMN "dias_abandono"`);
    await queryRunner.query(`ALTER TABLE "repair_orders" DROP COLUMN "es_garantia"`);
    await queryRunner.query(
      `ALTER TABLE "repair_orders" DROP CONSTRAINT "FK_repair_orders_orden_origen"`,
    );
    await queryRunner.query(`ALTER TABLE "repair_orders" DROP COLUMN "orden_origen_id"`);
  }
}
