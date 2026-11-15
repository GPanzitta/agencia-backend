import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tienda, etapa 4: los banners de la portada (spec 2026-10-08 tienda portada
 * §2.1). Tabla nueva, sin relleno: ningún taller tiene banners todavía. El
 * tope de 8 por taller lo pone el servicio (BANNER_MAXIMO).
 */
export class BannersTienda1789800000012 implements MigrationInterface {
  name = 'BannersTienda1789800000012';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "banners_tienda" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid NOT NULL,
        "titulo" character varying(80),
        "texto" character varying(160),
        "link" character varying(300),
        "imagen_escritorio_url" text,
        "imagen_celular_url" text,
        "desde" date,
        "hasta" date,
        "orden" integer NOT NULL DEFAULT 0,
        "activo" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_banners_tienda" PRIMARY KEY ("id"),
        CONSTRAINT "FK_banners_tienda_empresa" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX "IDX_banners_tienda_empresa_orden" ON "banners_tienda" ("company_id", "orden")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "banners_tienda"`);
  }
}
