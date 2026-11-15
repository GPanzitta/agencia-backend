import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * «Te lo instalamos» (spec 2026-11-07 §8.3): un interruptor y las condiciones
 * en el perfil público, para todo el taller. Riesgo: ninguno; una columna con
 * default `false` (apagada, como hoy) y otra nula, en una fila por taller.
 */
export class InstalacionDelTaller1790000000017 implements MigrationInterface {
  name = 'InstalacionDelTaller1790000000017';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "perfil_publico" ADD COLUMN IF NOT EXISTS "instalacion_activa" boolean NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE "perfil_publico" ADD COLUMN IF NOT EXISTS "instalacion_texto" character varying(200)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "perfil_publico" DROP COLUMN IF EXISTS "instalacion_texto"`);
    await q.query(`ALTER TABLE "perfil_publico" DROP COLUMN IF EXISTS "instalacion_activa"`);
  }
}
