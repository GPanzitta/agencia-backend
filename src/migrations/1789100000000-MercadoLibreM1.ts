import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mercado Libre — M1 (11/09/2026): la conexión del taller y el espejo del
 * catálogo. Nada de publicaciones todavía (M2).
 *
 * `conexiones_ml` es una entidad propia y no columnas en `company`: son ocho
 * campos que además rotan solos cada 6 horas. `mapeos_categoria_ml` guarda un
 * SNAPSHOT de los atributos obligatorios para que validar no dependa de que
 * ML esté arriba. `ingredients.ml_atributos` es el escape por repuesto para
 * lo que ni la ficha ni la categoría pueden contestar (Color, Voltaje).
 */
export class MercadoLibreM11789100000000 implements MigrationInterface {
  name = 'MercadoLibreM11789100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "conexiones_ml" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid NOT NULL,
        "ml_user_id" character varying(30) NOT NULL,
        "nickname" character varying(100) NOT NULL,
        "access_token" text NOT NULL,
        "refresh_token" text NOT NULL,
        "expira_en" TIMESTAMP WITH TIME ZONE NOT NULL,
        "colchon_stock" integer NOT NULL DEFAULT 1,
        "conectada_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "ultimo_error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conexiones_ml" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_conexiones_ml_empresa" UNIQUE ("company_id"),
        CONSTRAINT "FK_conexiones_ml_empresa" FOREIGN KEY ("company_id")
          REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`
      CREATE TABLE "mapeos_categoria_ml" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid NOT NULL,
        "categoria_id" uuid NOT NULL,
        "ml_category_id" character varying(20) NOT NULL,
        "ml_ruta" character varying(300) NOT NULL,
        "atributos_ml" jsonb NOT NULL DEFAULT '[]',
        "valores_fijos" jsonb NOT NULL DEFAULT '{}',
        "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mapeos_categoria_ml" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_mapeos_categoria_ml_categoria" UNIQUE ("categoria_id"),
        CONSTRAINT "FK_mapeos_categoria_ml_empresa" FOREIGN KEY ("company_id")
          REFERENCES "company"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_mapeos_categoria_ml_categoria" FOREIGN KEY ("categoria_id")
          REFERENCES "categorias_repuesto"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_mapeos_categoria_ml_empresa" ON "mapeos_categoria_ml" ("company_id")`);
    await q.query(`ALTER TABLE "ingredients" ADD "ml_atributos" jsonb NOT NULL DEFAULT '{}'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN "ml_atributos"`);
    await q.query(`DROP TABLE "mapeos_categoria_ml"`);
    await q.query(`DROP TABLE "conexiones_ml"`);
  }
}
