import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fotos del sitio editables desde el ERP (spec 2026-10-18).
 *
 * - `perfil_publico.fotos_sitio`: las fotos propias de cada lugar de la
 *   portada (`{clave: [{url, miniatura} | null]}`); vacío = todas originales.
 * - `perfil_publico.video_portada_url`: el video grande de la portada.
 *
 * Riesgo: bajo. Columnas nuevas, una con default constante y otra anulable
 * (no reescriben la tabla ni hace falta rellenar filas); `IF NOT EXISTS`: se
 * puede correr dos veces.
 */
export class FotosDelSitio1790000000011 implements MigrationInterface {
  name = 'FotosDelSitio1790000000011';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "perfil_publico" ADD COLUMN IF NOT EXISTS "fotos_sitio" jsonb NOT NULL DEFAULT '{}'`);
    await q.query(`ALTER TABLE "perfil_publico" ADD COLUMN IF NOT EXISTS "video_portada_url" text`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "perfil_publico" DROP COLUMN IF EXISTS "video_portada_url"`);
    await q.query(`ALTER TABLE "perfil_publico" DROP COLUMN IF EXISTS "fotos_sitio"`);
  }
}
