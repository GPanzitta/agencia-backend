import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agencia (13/11/2026): las fotos que alguien manda de su auto desde
 * «Vendé tu auto» quedan en el interesado.
 *
 * Riesgo: ninguno. Una columna nueva con valor por defecto.
 */
export class FotosDeInteresado1790000000026 implements MigrationInterface {
  name = 'FotosDeInteresado1790000000026';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "interesados" ADD COLUMN IF NOT EXISTS "fotos" jsonb NOT NULL DEFAULT '[]'`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.dropColumn('interesados', 'fotos');
  }
}
