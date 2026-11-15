import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agencia, tanda de la demo (12/11/2026): los interesados (quién consultó, qué
 * busca, en qué etapa está, cuándo volver a hablarle) y la moneda de cada caja.
 *
 * Riesgo: bajo. Una tabla nueva y una columna con valor por defecto en `wallets`
 * (las cajas existentes quedan en pesos, que es lo que eran).
 */
export class Interesados1790000000024 implements MigrationInterface {
  name = 'Interesados1790000000024';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "interesados" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid,
        "nombre" varchar(120) NOT NULL,
        "telefono" varchar(40),
        "email" varchar(120),
        "origen" varchar(14) NOT NULL DEFAULT 'salon',
        "etapa" varchar(12) NOT NULL DEFAULT 'nuevo',
        "temperatura" varchar(8) NOT NULL DEFAULT 'tibio',
        "unidad_id" uuid,
        "busca" text,
        "busca_marca" varchar(60),
        "busca_carroceria" varchar(30),
        "precio_max" numeric(14,2),
        "precio_moneda" varchar(3),
        "tiene_usado" varchar(200),
        "proxima_accion" date,
        "proxima_nota" varchar(200),
        "vendedor_id" uuid,
        "seguimiento" jsonb NOT NULL DEFAULT '[]',
        "motivo_perdida" varchar(200),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interesados" PRIMARY KEY ("id"),
        CONSTRAINT "FK_interesados_company" FOREIGN KEY ("company_id") REFERENCES "company"("id"),
        CONSTRAINT "CHK_interesados_origen" CHECK ("origen" IN ('salon', 'whatsapp', 'telefono', 'sitio', 'mercado_libre', 'referido', 'otro')),
        CONSTRAINT "CHK_interesados_etapa" CHECK ("etapa" IN ('nuevo', 'contactado', 'visita', 'negociando', 'ganado', 'perdido')),
        CONSTRAINT "CHK_interesados_temperatura" CHECK ("temperatura" IN ('frio', 'tibio', 'caliente')),
        CONSTRAINT "CHK_interesados_precio" CHECK (("precio_max" IS NULL OR "precio_max" > 0) AND ("precio_moneda" IS NULL OR "precio_moneda" IN ('ARS', 'USD')))
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_interesados_company_etapa" ON "interesados" ("company_id", "etapa")`);
    await q.query(`ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "moneda" varchar(3) NOT NULL DEFAULT 'ARS'`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.dropColumn('wallets', 'moneda');
    await q.dropTable('interesados', true);
  }
}
