import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fotos adjuntas a la orden en cualquier etapa (07/09/2026). Tabla nueva; las
 * fotos de recepción quedan donde estaban (`repair_orders.fotos_recepcion`) y
 * se mezclan al listar.
 */
export class OrdenFotos1788500000000 implements MigrationInterface {
  name = 'OrdenFotos1788500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "orden_fotos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "url" character varying(300) NOT NULL,
        "url_miniatura" character varying(300) NOT NULL,
        "etapa" character varying(40) NOT NULL,
        "nota" character varying(300),
        "peso" integer NOT NULL DEFAULT 0,
        "autor_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orden_fotos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_orden_fotos_orden" FOREIGN KEY ("order_id") REFERENCES "repair_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_orden_fotos_autor" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await q.query(`CREATE INDEX "IDX_orden_fotos_orden" ON "orden_fotos" ("order_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_orden_fotos_orden"`);
    await q.query(`DROP TABLE "orden_fotos"`);
  }
}
