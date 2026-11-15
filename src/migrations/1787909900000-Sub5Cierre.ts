import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sub-proyecto 5: cierre del ciclo — QA, cobro del saldo en caja y garantía.
 */
export class Sub5Cierre1787909900000 implements MigrationInterface {
  name = 'Sub5Cierre1787909900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "repair_orders" ADD "qa_checklist" jsonb`);
    await queryRunner.query(`ALTER TABLE "repair_orders" ADD "garantia_hasta" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "repair_orders" ADD "saldo_cobrado" numeric(12,2)`);
    await queryRunner.query(`ALTER TABLE "company" ADD "garantia_dias" integer NOT NULL DEFAULT 90`);
    await queryRunner.query(`ALTER TABLE "company" ADD "mp_wallet_id" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "company" DROP COLUMN "mp_wallet_id"`);
    await queryRunner.query(`ALTER TABLE "company" DROP COLUMN "garantia_dias"`);
    await queryRunner.query(`ALTER TABLE "repair_orders" DROP COLUMN "saldo_cobrado"`);
    await queryRunner.query(`ALTER TABLE "repair_orders" DROP COLUMN "garantia_hasta"`);
    await queryRunner.query(`ALTER TABLE "repair_orders" DROP COLUMN "qa_checklist"`);
  }
}
