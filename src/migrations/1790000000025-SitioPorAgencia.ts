import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agencia, tanda 2 (12/11/2026): la dirección propia del sitio de cada agencia.
 * Las empresas existentes quedan sin dirección: se les asigna sola, a partir de
 * su nombre, la primera vez que el ERP la pide.
 *
 * Riesgo: ninguno. Una columna nueva, sin valor por defecto.
 */
export class SitioPorAgencia1790000000025 implements MigrationInterface {
  name = 'SitioPorAgencia1790000000025';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "slug" varchar(60)`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_company_slug" ON "company" ("slug") WHERE "slug" IS NOT NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.dropIndex('company', 'UQ_company_slug');
    await q.dropColumn('company', 'slug');
  }
}
