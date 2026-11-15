import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sub-proyecto 3 (Repuestos/SKU): código de repuesto en el catálogo y motivo
 * de movimiento de stock "reparacion" para el descuento al reparar.
 */
export class Sub3Repuestos1787906900000 implements MigrationInterface {
  name = 'Sub3Repuestos1787906900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ingredients" ADD "codigo" character varying(60)`);
    await queryRunner.query(`CREATE INDEX "IDX_ingredients_codigo" ON "ingredients" ("codigo")`);
    // Postgres ≥ 12 permite ADD VALUE dentro de la transacción de la migración
    // (el valor nuevo recién se puede usar después del commit, y acá nadie lo
    // usa hasta que corre la app).
    await queryRunner.query(
      `ALTER TYPE "public"."stock_movements_origen_enum" ADD VALUE IF NOT EXISTS 'reparacion'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // El valor del enum no se remueve: Postgres no soporta DROP VALUE y no
    // rompe nada dejarlo.
    await queryRunner.query(`DROP INDEX "public"."IDX_ingredients_codigo"`);
    await queryRunner.query(`ALTER TABLE "ingredients" DROP COLUMN "codigo"`);
  }
}
