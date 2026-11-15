import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Alta sola de talleres (spec 2026-10-28 §6): la cuenta nace sin poder entrar
 * hasta confirmar el correo, se anotan los rubros que declaró y lo que marcó de
 * sus primeros pasos. Una orden importada recuerda su número en el otro sistema.
 *
 * Riesgo: bajo. Columnas nuevas; el default deja a los usuarios existentes como
 * están. `IF NOT EXISTS`: se puede correr dos veces.
 */
export class AltaDeTaller1790000000014 implements MigrationInterface {
  name = 'AltaDeTaller1790000000014';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "confirmacion_pendiente" boolean NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "rubros_declarados" jsonb`);
    await q.query(`ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "primeros_pasos" jsonb NOT NULL DEFAULT '{}'`);
    await q.query(`ALTER TABLE "repair_orders" ADD COLUMN IF NOT EXISTS "numero_externo" varchar(60)`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_repair_orders_numero_externo" ON "repair_orders" ("company_id", "numero_externo") WHERE "numero_externo" IS NOT NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "UQ_repair_orders_numero_externo"`);
    await q.query(`ALTER TABLE "repair_orders" DROP COLUMN IF EXISTS "numero_externo"`);
    await q.query(`ALTER TABLE "company" DROP COLUMN IF EXISTS "primeros_pasos"`);
    await q.query(`ALTER TABLE "company" DROP COLUMN IF EXISTS "rubros_declarados"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "confirmacion_pendiente"`);
  }
}
