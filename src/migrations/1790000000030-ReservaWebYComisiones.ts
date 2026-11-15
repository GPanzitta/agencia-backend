import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agencia (13/11/2026): el cliente pide reservar un auto desde el sitio y
 * transfiere la seña; la agencia confirma cuando la ve acreditada. Y la
 * comisión de cada vendedor: su porcentaje y si ya se le pagó.
 *
 * Riesgo: ninguno. Una tabla nueva y columnas nuevas, vacías.
 */
export class ReservaWebYComisiones1790000000030 implements MigrationInterface {
  name = 'ReservaWebYComisiones1790000000030';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "sitio_reserva" jsonb`);
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "comision_pct" numeric(5,2)`);
    await q.query(`ALTER TABLE "operaciones" ADD COLUMN IF NOT EXISTS "comision_pagada_at" timestamptz`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "reservas_web" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "token" uuid NOT NULL DEFAULT gen_random_uuid(),
        "unidad_id" uuid NOT NULL REFERENCES "unidades"("id") ON DELETE CASCADE,
        "estado" varchar(12) NOT NULL DEFAULT 'pendiente',
        "cliente_nombre" varchar(120) NOT NULL,
        "cliente_telefono" varchar(40) NOT NULL,
        "cliente_documento" varchar(20),
        "monto" numeric(14,2) NOT NULL,
        "moneda" varchar(3) NOT NULL,
        "vence_at" timestamptz NOT NULL,
        "dias" int NOT NULL DEFAULT 7,
        "operacion_id" uuid REFERENCES "operaciones"("id") ON DELETE SET NULL,
        "motivo" varchar(300),
        "company_id" uuid REFERENCES "company"("id"),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_reservas_web" CHECK ("estado" IN ('pendiente', 'confirmada', 'rechazada', 'vencida') AND "monto" > 0 AND "moneda" IN ('ARS', 'USD'))
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_reservas_web_token" ON "reservas_web" ("token")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_reservas_web_empresa" ON "reservas_web" ("company_id", "estado")`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_reservas_web_unidad_pendiente" ON "reservas_web" ("unidad_id") WHERE "estado" = 'pendiente'`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "reservas_web"`);
    await q.dropColumn('operaciones', 'comision_pagada_at');
    await q.dropColumn('users', 'comision_pct');
    await q.dropColumn('company', 'sitio_reserva');
  }
}
