import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tienda de repuestos — T1 (09/09/2026): publicar el catálogo que ya existe.
 *
 * No crea catálogo: agrega lo que le falta al que hay para poder mostrarlo
 * afuera (publicado, categoría de tienda, descripción pública y URL) y la
 * taxonomía propia de la vidriera.
 *
 * `publicado` entra en false para TODOS: la migración no publica nada.
 */
export class TiendaCatalogo1788800000000 implements MigrationInterface {
  name = 'TiendaCatalogo1788800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "categorias_repuesto" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "nombre" character varying(80) NOT NULL,
        "slug" character varying(90) NOT NULL,
        "padre_id" uuid,
        "orden" integer NOT NULL DEFAULT 0,
        "texto_cabecera" text,
        "imagen_url" character varying(300),
        "activa" boolean NOT NULL DEFAULT true,
        "company_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_categorias_repuesto" PRIMARY KEY ("id"),
        CONSTRAINT "FK_categorias_repuesto_padre" FOREIGN KEY ("padre_id")
          REFERENCES "categorias_repuesto"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_categorias_repuesto_empresa" FOREIGN KEY ("company_id")
          REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX "IDX_categorias_repuesto_empresa" ON "categorias_repuesto" ("company_id")`,
    );
    await q.query(
      `CREATE INDEX "IDX_categorias_repuesto_padre" ON "categorias_repuesto" ("company_id", "padre_id")`,
    );
    // Dos índices parciales: en Postgres NULL nunca empata con NULL, así que un
    // unique de tres columnas dejaría pasar dos rubros raíz con el mismo slug.
    await q.query(`
      CREATE UNIQUE INDEX "UQ_categoria_repuesto_slug_raiz"
        ON "categorias_repuesto" ("company_id", "slug") WHERE "padre_id" IS NULL
    `);
    await q.query(`
      CREATE UNIQUE INDEX "UQ_categoria_repuesto_slug_hijo"
        ON "categorias_repuesto" ("company_id", "padre_id", "slug") WHERE "padre_id" IS NOT NULL
    `);

    await q.query(`
      ALTER TABLE "ingredients"
        ADD COLUMN "publicado" boolean NOT NULL DEFAULT false,
        ADD COLUMN "categoria_id" uuid,
        ADD COLUMN "descripcion_publica" text,
        ADD COLUMN "slug" character varying(140)
    `);
    await q.query(`
      ALTER TABLE "ingredients"
        ADD CONSTRAINT "FK_ingredients_categoria_tienda" FOREIGN KEY ("categoria_id")
          REFERENCES "categorias_repuesto"("id") ON DELETE SET NULL
    `);
    // El slug es la URL: único por empresa, y sólo entre los que tienen uno.
    await q.query(`
      CREATE UNIQUE INDEX "UQ_ingredients_slug" ON "ingredients" ("company_id", "slug")
        WHERE "slug" IS NOT NULL
    `);
    // El índice que sirve a la tienda: casi todo el catálogo NO está publicado,
    // así que el índice parcial es una fracción del total.
    await q.query(`
      CREATE INDEX "IDX_ingredients_publicados" ON "ingredients" ("company_id", "categoria_id")
        WHERE "publicado" = true
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_ingredients_publicados"`);
    await q.query(`DROP INDEX "UQ_ingredients_slug"`);
    await q.query(`ALTER TABLE "ingredients" DROP CONSTRAINT "FK_ingredients_categoria_tienda"`);
    await q.query(`
      ALTER TABLE "ingredients"
        DROP COLUMN "slug",
        DROP COLUMN "descripcion_publica",
        DROP COLUMN "categoria_id",
        DROP COLUMN "publicado"
    `);
    await q.query(`DROP TABLE "categorias_repuesto"`);
  }
}
