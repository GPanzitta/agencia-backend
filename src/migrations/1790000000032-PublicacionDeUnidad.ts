import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agencia (14/11/2026): la publicación de cada auto —equipamiento destacado,
 * características, colores y opciones de compra— que se arma en el ERP y se ve en el sitio.
 *
 * Riesgo: ninguno. Una columna nueva, vacía.
 */
export class PublicacionDeUnidad1790000000032 implements MigrationInterface {
  name = 'PublicacionDeUnidad1790000000032';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "unidades" ADD COLUMN IF NOT EXISTS "publicacion" jsonb`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.dropColumn('unidades', 'publicacion');
  }
}
