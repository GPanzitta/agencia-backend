import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dos pedidos del mostrador:
 * - La OC de repuestos lleva N° de pedido (el del proveedor) y puede quedar
 *   atada a la orden de reparación que la origina.
 * - La ficha del cliente suma condición de IVA y persona de contacto (B2B).
 */
export class PedidosYFichaCliente1787911900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "purchase_orders" ADD "numero_pedido" character varying(40)`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" ADD "repair_order_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" ADD CONSTRAINT "FK_po_repair_order" FOREIGN KEY ("repair_order_id") REFERENCES "repair_orders"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_po_repair_order" ON "purchase_orders" ("repair_order_id")`);
    await queryRunner.query(`ALTER TABLE "customers" ADD "condicion_iva" character varying(30)`);
    await queryRunner.query(`ALTER TABLE "customers" ADD "contacto" character varying(120)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "contacto"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "condicion_iva"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_po_repair_order"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP CONSTRAINT "FK_po_repair_order"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN "repair_order_id"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN "numero_pedido"`);
  }
}
