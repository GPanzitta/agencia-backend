import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Abono y planes (spec 2026-10-28 §7, §11.2 y §13.3).
 *
 * Riesgo: bajo, y hay una sola cosa delicada: las empresas que ya existen pasan
 * al plan `interno`, sin tope, para que nada de producción quede limitado. Eso
 * corre sólo si la columna `plan` no existía: corrida de nuevo, esta migración
 * no convierte en `interno` a un taller gratis que se registró después.
 */
export class AbonoYPlanes1790000000015 implements MigrationInterface {
  name = 'AbonoYPlanes1790000000015';

  public async up(q: QueryRunner): Promise<void> {
    const yaEstaba = await q.query(
      `SELECT 1 AS existe FROM information_schema.columns WHERE table_name = 'company' AND column_name = 'plan'`,
    );

    await q.query(`ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "plan" varchar(10) NOT NULL DEFAULT 'gratis'`);
    await q.query(`ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "abono_vence_en" timestamptz`);
    await q.query(`ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "mp_preapproval_id" varchar(60)`);
    await q.query(`ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "mp_preapproval_estado" varchar(20)`);

    if (yaEstaba.length === 0) {
      await q.query(`UPDATE "company" SET "plan" = 'interno'`);
    }

    await q.query(`CREATE TABLE IF NOT EXISTS "plataforma_config" (
      "id" integer PRIMARY KEY CHECK ("id" = 1),
      "precio_mensual" numeric(12,2) NOT NULL,
      "tope_ordenes_gratis" integer NOT NULL,
      "dias_gracia" integer NOT NULL
    )`);
    await q.query(`INSERT INTO "plataforma_config" ("id", "precio_mensual", "tope_ordenes_gratis", "dias_gracia")
      VALUES (1, 25000, 30, 7) ON CONFLICT ("id") DO NOTHING`);

    await q.query(`CREATE TABLE IF NOT EXISTS "abono_pagos" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "company_id" uuid NOT NULL REFERENCES "company" ("id"),
      "mp_pago_id" varchar(60) NOT NULL,
      "monto" numeric(12,2) NOT NULL,
      "pagado_en" timestamptz NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_abono_pagos_mp_pago_id" UNIQUE ("mp_pago_id")
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_abono_pagos_company" ON "abono_pagos" ("company_id", "pagado_en")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "abono_pagos"`);
    await q.query(`DROP TABLE IF EXISTS "plataforma_config"`);
    await q.query(`ALTER TABLE "company" DROP COLUMN IF EXISTS "mp_preapproval_estado"`);
    await q.query(`ALTER TABLE "company" DROP COLUMN IF EXISTS "mp_preapproval_id"`);
    await q.query(`ALTER TABLE "company" DROP COLUMN IF EXISTS "abono_vence_en"`);
    await q.query(`ALTER TABLE "company" DROP COLUMN IF EXISTS "plan"`);
  }
}
