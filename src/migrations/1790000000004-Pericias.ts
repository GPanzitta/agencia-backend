import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pericia técnica de la orden («Legales», pedido del dueño 16/10/2026): el
 * informe técnico de parte para una aseguradora o una marca. Una por orden
 * (índice único), se borra con la orden. Sin historial a propósito.
 *
 * Riesgo: bajo. Tabla nueva, `IF NOT EXISTS`: se puede correr dos veces.
 */
export class Pericias1790000000004 implements MigrationInterface {
  name = 'Pericias1790000000004';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "pericias" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "company_id" uuid,
        "solicitante_tipo" varchar(20) NOT NULL DEFAULT 'aseguradora',
        "solicitante_nombre" varchar(160),
        "referencia" varchar(80),
        "objeto" text,
        "operaciones" text,
        "instrumentos" text,
        "fundamentos" text,
        "causa" varchar(20),
        "conclusion" text,
        "garantia_factura" varchar(60),
        "garantia_fecha_compra" date,
        "garantia_vendedor" varchar(160),
        "fotos" jsonb NOT NULL DEFAULT '[]',
        "lugar" varchar(120),
        "estado" varchar(20) NOT NULL DEFAULT 'borrador',
        "finalizada_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pericias" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pericias_orden" FOREIGN KEY ("order_id") REFERENCES "repair_orders"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pericias_order" ON "pericias" ("order_id")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_pericias_company" ON "pericias" ("company_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "pericias"`);
  }
}
