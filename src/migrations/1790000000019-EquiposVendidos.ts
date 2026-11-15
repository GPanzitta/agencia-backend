import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Equipos vendidos (programa de módulos del 09/11/2026, módulo 1): cada unidad
 * que sale por una venta de la tienda queda con su número de serie y la
 * garantía de fábrica; el producto recuerda cuántos meses da su fábrica.
 *
 * Riesgo: ninguno sobre lo existente. Una tabla nueva y una columna que puede
 * quedar vacía. El número de serie es único por taller (normalizado): la misma
 * unidad no se vende dos veces.
 */
export class EquiposVendidos1790000000019 implements MigrationInterface {
  name = 'EquiposVendidos1790000000019';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ingredients" ADD COLUMN IF NOT EXISTS "garantia_fabrica_meses" smallint`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "unidades_vendidas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid,
        "venta_id" uuid NOT NULL,
        "venta_item_id" uuid NOT NULL,
        "numero_serie" varchar(120) NOT NULL,
        "serie_normalizada" varchar(120) NOT NULL,
        "garantia_meses" smallint,
        "garantia_desde" date NOT NULL,
        "creado_por" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_unidades_vendidas" PRIMARY KEY ("id"),
        CONSTRAINT "FK_unidades_vendidas_company" FOREIGN KEY ("company_id") REFERENCES "company"("id"),
        CONSTRAINT "FK_unidades_vendidas_venta" FOREIGN KEY ("venta_id") REFERENCES "ventas_tienda"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_unidades_vendidas_item" FOREIGN KEY ("venta_item_id") REFERENCES "ventas_tienda_items"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_unidades_vendidas_usuario" FOREIGN KEY ("creado_por") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_unidades_vendidas_meses" CHECK ("garantia_meses" IS NULL OR "garantia_meses" BETWEEN 0 AND 120)
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_unidades_vendidas_serie" ON "unidades_vendidas" ("company_id", "serie_normalizada")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_unidades_vendidas_venta" ON "unidades_vendidas" ("venta_id")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "unidades_vendidas"`);
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN IF EXISTS "garantia_fabrica_meses"`);
  }
}
