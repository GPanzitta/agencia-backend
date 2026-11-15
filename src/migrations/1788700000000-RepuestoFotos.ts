import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fotos del repuesto (07/09/2026): galería por repuesto, reemplazable. */
export class RepuestoFotos1788700000000 implements MigrationInterface {
  name = 'RepuestoFotos1788700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "repuesto_fotos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "ingredient_id" uuid NOT NULL,
        "url" character varying(300) NOT NULL,
        "url_miniatura" character varying(300) NOT NULL,
        "orden" integer NOT NULL DEFAULT 0,
        "peso" integer NOT NULL DEFAULT 0,
        "autor_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_repuesto_fotos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_repuesto_fotos_repuesto" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_repuesto_fotos_autor" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await q.query(`CREATE INDEX "IDX_repuesto_fotos_repuesto" ON "repuesto_fotos" ("ingredient_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_repuesto_fotos_repuesto"`);
    await q.query(`DROP TABLE "repuesto_fotos"`);
  }
}
