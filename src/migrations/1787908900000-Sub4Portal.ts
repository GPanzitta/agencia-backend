import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sub-proyecto 4: portal del cliente + Mercado Pago.
 * Token público por orden (el link del WhatsApp), seña pagada y config MP
 * por taller.
 */
export class Sub4Portal1787908900000 implements MigrationInterface {
  name = 'Sub4Portal1787908900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // gen_random_uuid() es nativo en PG 13+ (pgcrypto integrado).
    await queryRunner.query(
      `ALTER TABLE "repair_orders" ADD "portal_token" uuid NOT NULL DEFAULT gen_random_uuid()`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_repair_orders_portal_token" ON "repair_orders" ("portal_token")`,
    );
    await queryRunner.query(`ALTER TABLE "repair_orders" ADD "sena_pagada" numeric(12,2)`);
    await queryRunner.query(`ALTER TABLE "repair_orders" ADD "mp_payment_id" character varying(40)`);
    await queryRunner.query(`ALTER TABLE "company" ADD "mp_access_token" text`);
    await queryRunner.query(`ALTER TABLE "company" ADD "sena_porcentaje" integer NOT NULL DEFAULT 50`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "company" DROP COLUMN "sena_porcentaje"`);
    await queryRunner.query(`ALTER TABLE "company" DROP COLUMN "mp_access_token"`);
    await queryRunner.query(`ALTER TABLE "repair_orders" DROP COLUMN "mp_payment_id"`);
    await queryRunner.query(`ALTER TABLE "repair_orders" DROP COLUMN "sena_pagada"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_repair_orders_portal_token"`);
    await queryRunner.query(`ALTER TABLE "repair_orders" DROP COLUMN "portal_token"`);
  }
}
