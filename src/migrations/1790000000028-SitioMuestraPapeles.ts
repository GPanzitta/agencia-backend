import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agencia (13/11/2026): cada agencia decide si su sitio muestra el estado de
 * los papeles de cada auto. Por defecto sí.
 *
 * Riesgo: ninguno. Una columna nueva con valor por defecto.
 */
export class SitioMuestraPapeles1790000000028 implements MigrationInterface {
  name = 'SitioMuestraPapeles1790000000028';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "sitio_muestra_papeles" boolean NOT NULL DEFAULT true`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.dropColumn('company', 'sitio_muestra_papeles');
  }
}
