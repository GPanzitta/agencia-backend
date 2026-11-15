import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mercado Pago por OAuth de la plataforma (spec 2026-10-28 §13.1): cada taller
 * conecta su cuenta y el token se renueva solo.
 *
 * Riesgo: bajo. Columnas anulables nuevas, sin rellenar; un token pegado a mano
 * queda como está y sigue cobrando. `IF NOT EXISTS`: se puede correr dos veces.
 */
export class MercadoPagoOAuth1790000000013 implements MigrationInterface {
  name = 'MercadoPagoOAuth1790000000013';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "mp_refresh_token" text`);
    await q.query(`ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "mp_user_id" varchar(40)`);
    await q.query(`ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "mp_cuenta" varchar(120)`);
    await q.query(`ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "mp_token_vence" timestamptz`);
    await q.query(`ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "mp_conectado_en" timestamptz`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "company" DROP COLUMN IF EXISTS "mp_conectado_en"`);
    await q.query(`ALTER TABLE "company" DROP COLUMN IF EXISTS "mp_token_vence"`);
    await q.query(`ALTER TABLE "company" DROP COLUMN IF EXISTS "mp_cuenta"`);
    await q.query(`ALTER TABLE "company" DROP COLUMN IF EXISTS "mp_user_id"`);
    await q.query(`ALTER TABLE "company" DROP COLUMN IF EXISTS "mp_refresh_token"`);
  }
}
