import { MigrationInterface, QueryRunner } from 'typeorm';

/** Desguace (spec 2026-09-07): dos tablas nuevas y el origen de stock `desguace`. */
export class Desguaces1788600000000 implements MigrationInterface {
  name = 'Desguaces1788600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "public"."stock_movements_origen_enum" ADD VALUE IF NOT EXISTS 'desguace'`);
    await q.query(`
      CREATE TABLE "desguaces" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "numero" character varying(20) NOT NULL,
        "origen" character varying(20) NOT NULL,
        "order_id" uuid,
        "repuesto_origen_id" uuid,
        "tipo" character varying(80) NOT NULL,
        "marca" character varying(120),
        "modelo" character varying(120),
        "numero_serie" character varying(120),
        "defecto" text,
        "estado" character varying(10) NOT NULL DEFAULT 'abierto',
        "notas" text,
        "autor_id" uuid,
        "company_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "cerrado_en" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_desguaces" PRIMARY KEY ("id"),
        CONSTRAINT "FK_desguaces_orden" FOREIGN KEY ("order_id") REFERENCES "repair_orders"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_desguaces_repuesto_origen" FOREIGN KEY ("repuesto_origen_id") REFERENCES "ingredients"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_desguaces_autor" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_desguaces_company" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "IDX_desguaces_company_numero" ON "desguaces" ("company_id", "numero")`);
    await q.query(`CREATE INDEX "IDX_desguaces_company" ON "desguaces" ("company_id")`);
    await q.query(`
      CREATE TABLE "desguace_piezas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "desguace_id" uuid NOT NULL,
        "ingredient_id" uuid NOT NULL,
        "cantidad" integer NOT NULL DEFAULT 1,
        "condicion" character varying(12) NOT NULL DEFAULT 'sin_probar',
        "descripcion" character varying(300),
        "stock_movement_id" uuid,
        "autor_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_desguace_piezas" PRIMARY KEY ("id"),
        CONSTRAINT "FK_desguace_piezas_desguace" FOREIGN KEY ("desguace_id") REFERENCES "desguaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_desguace_piezas_ingredient" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id"),
        CONSTRAINT "FK_desguace_piezas_autor" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await q.query(`CREATE INDEX "IDX_desguace_piezas_desguace" ON "desguace_piezas" ("desguace_id")`);
    await q.query(`CREATE INDEX "IDX_desguace_piezas_ingredient" ON "desguace_piezas" ("ingredient_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "desguace_piezas"`);
    await q.query(`DROP TABLE "desguaces"`);
    // El valor del enum no se puede quitar en Postgres: queda.
  }
}
