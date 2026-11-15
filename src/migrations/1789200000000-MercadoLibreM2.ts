import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mercado Libre — M2 (12/09/2026): publicar y sincronizar. La publicación ES
 * la cola: una fila por repuesto con el snapshot de lo publicado y las
 * columnas de reintento; no hay tabla de trabajos. Las cerradas quedan como
 * historial (índice único parcial). La plantilla (recargo, redondeo, tipo,
 * garantía) vive en la conexión porque es una por taller; el precio fijo y
 * la condición van por repuesto.
 */
export class MercadoLibreM21789200000000 implements MigrationInterface {
  name = 'MercadoLibreM21789200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "publicaciones_ml" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid NOT NULL,
        "ingredient_id" uuid NOT NULL,
        "ml_item_id" character varying(30),
        "estado_local" character varying(20) NOT NULL DEFAULT 'pendiente_crear',
        "pausada_por_usuario" boolean NOT NULL DEFAULT false,
        "estado_ml" character varying(20),
        "precio_publicado" numeric(12,2),
        "stock_publicado" integer,
        "titulo_publicado" character varying(60),
        "permalink" character varying(300),
        "pendiente_sync" boolean NOT NULL DEFAULT true,
        "reenviar_datos" boolean NOT NULL DEFAULT false,
        "intentos" integer NOT NULL DEFAULT 0,
        "proximo_intento" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "ultimo_error" text,
        "publicada_en" TIMESTAMP WITH TIME ZONE,
        "sincronizada_en" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_publicaciones_ml" PRIMARY KEY ("id"),
        CONSTRAINT "FK_publicaciones_ml_empresa" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_publicaciones_ml_repuesto" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "UQ_publicaciones_ml_viva" ON "publicaciones_ml" ("company_id", "ingredient_id") WHERE "estado_local" <> 'cerrada'`);
    await q.query(`CREATE INDEX "IDX_publicaciones_ml_cola" ON "publicaciones_ml" ("proximo_intento") WHERE "pendiente_sync"`);
    await q.query(`ALTER TABLE "conexiones_ml"
      ADD "recargo_pct" numeric(5,2) NOT NULL DEFAULT 0,
      ADD "redondeo_multiplo" integer NOT NULL DEFAULT 100,
      ADD "tipo_publicacion" character varying(20) NOT NULL DEFAULT 'gold_special',
      ADD "garantia_tipo" character varying(40) NOT NULL DEFAULT 'Garantía del vendedor',
      ADD "garantia_dias" integer NOT NULL DEFAULT 30`);
    await q.query(`ALTER TABLE "ingredients" ADD "ml_precio" numeric(12,2), ADD "ml_condicion" character varying(10) NOT NULL DEFAULT 'nuevo'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN "ml_condicion", DROP COLUMN "ml_precio"`);
    await q.query(`ALTER TABLE "conexiones_ml" DROP COLUMN "garantia_dias", DROP COLUMN "garantia_tipo", DROP COLUMN "tipo_publicacion", DROP COLUMN "redondeo_multiplo", DROP COLUMN "recargo_pct"`);
    await q.query(`DROP TABLE "publicaciones_ml"`);
  }
}
