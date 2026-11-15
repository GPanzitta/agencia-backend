import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Datos del sitio del comercio (S1c-b, 20/09/2026): video de portada, videos
 * de YouTube, Place ID de Google con su copia de opiniones, y la vidriera de
 * repuestos destacados.
 *
 * El índice de la vidriera es PARCIAL: la inmensa mayoría de los repuestos
 * tiene `destacado_orden` nulo y no tiene sentido indexarlos: el carrusel de
 * la home lee como mucho 12 filas por taller.
 */
export class SitioDatos1789700000000 implements MigrationInterface {
  name = 'SitioDatos1789700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "perfil_publico" ADD "video_url" text`);
    await q.query(`ALTER TABLE "perfil_publico" ADD "video_poster_url" text`);
    await q.query(`ALTER TABLE "perfil_publico" ADD "videos" jsonb NOT NULL DEFAULT '[]'`);
    await q.query(`ALTER TABLE "perfil_publico" ADD "google_place_id" character varying(300)`);

    await q.query(`
      CREATE TABLE "opiniones_google" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "place_id" character varying(300) NOT NULL,
        "promedio" numeric(2,1),
        "total" integer,
        "url" text,
        "resenas" jsonb NOT NULL DEFAULT '[]',
        "simulada" boolean NOT NULL DEFAULT false,
        "actualizado_en" TIMESTAMP WITH TIME ZONE,
        "error" text,
        CONSTRAINT "PK_opiniones_google" PRIMARY KEY ("id"),
        CONSTRAINT "FK_opiniones_google_company" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "IDX_opiniones_google_company" ON "opiniones_google" ("company_id")`);

    await q.query(`ALTER TABLE "ingredients" ADD "destacado_orden" integer`);
    await q.query(`
      CREATE INDEX "IDX_ingredients_destacado" ON "ingredients" ("company_id", "destacado_orden")
      WHERE "destacado_orden" IS NOT NULL
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_ingredients_destacado"`);
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN "destacado_orden"`);
    await q.query(`DROP TABLE "opiniones_google"`);
    await q.query(`ALTER TABLE "perfil_publico" DROP COLUMN "google_place_id"`);
    await q.query(`ALTER TABLE "perfil_publico" DROP COLUMN "videos"`);
    await q.query(`ALTER TABLE "perfil_publico" DROP COLUMN "video_poster_url"`);
    await q.query(`ALTER TABLE "perfil_publico" DROP COLUMN "video_url"`);
  }
}
