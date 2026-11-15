import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agencia (14/11/2026): páginas de otros vendedores para comparar precios,
 * con la última lectura de cada una.
 *
 * Riesgo: ninguno. Una tabla nueva.
 */
export class Competidores1790000000031 implements MigrationInterface {
  name = 'Competidores1790000000031';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS "competidores" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "nombre" varchar(120) NOT NULL,
      "url" varchar(500) NOT NULL,
      "unidades" jsonb NOT NULL DEFAULT '[]',
      "leida_at" timestamptz,
      "error" varchar(300),
      "company_id" uuid,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_competidores_empresa" ON "competidores" ("company_id")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.dropTable('competidores', true);
  }
}
