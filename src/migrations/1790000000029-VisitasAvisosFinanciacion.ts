import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agencia (13/11/2026): el auto del interesado en datos sueltos (para pasarlo
 * al stock) y las condiciones con las que el sitio de cada agencia simula cuotas.
 *
 * Riesgo: ninguno. Dos columnas nuevas, vacías.
 */
export class VisitasAvisosFinanciacion1790000000029 implements MigrationInterface {
  name = 'VisitasAvisosFinanciacion1790000000029';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "interesados" ADD COLUMN IF NOT EXISTS "usado" jsonb`);
    await q.query(`ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "sitio_financiacion" jsonb`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.dropColumn('interesados', 'usado');
    await q.dropColumn('company', 'sitio_financiacion');
  }
}
