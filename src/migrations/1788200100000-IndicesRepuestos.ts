import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices faltantes en repuestos: las consultas de ficha, baja y OC en camino
 * filtran por estas columnas y no tenían índice.
 */
export class IndicesRepuestos1788200100000 implements MigrationInterface {
  name = 'IndicesRepuestos1788200100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_repair_order_repuestos_sku" ON "repair_order_repuestos" ("sku_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_purchase_order_items_ingredient" ON "purchase_order_items" ("ingredient_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_purchase_order_items_ingredient"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_repair_order_repuestos_sku"`);
  }
}
