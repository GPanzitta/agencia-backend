import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El carrusel de la tienda con video de fondo. Riesgo: ninguno; dos columnas
 * nulas en una tabla chica (como mucho 8 banners por taller).
 */
export class VideoEnBanners1790000000016 implements MigrationInterface {
  name = 'VideoEnBanners1790000000016';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "banners_tienda" ADD COLUMN IF NOT EXISTS "video_url" text`);
    await q.query(`ALTER TABLE "banners_tienda" ADD COLUMN IF NOT EXISTS "video_poster_url" text`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "banners_tienda" DROP COLUMN IF EXISTS "video_poster_url"`);
    await q.query(`ALTER TABLE "banners_tienda" DROP COLUMN IF EXISTS "video_url"`);
  }
}
