import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agencia (14/11/2026): la comparación de precios lee de fondo y guarda historia.
 * - `competidores.leyendo_desde`: desde cuándo hay una lectura en curso.
 * - `company.dolar_comparacion`: a cuánto toma el dólar la agencia para comparar.
 * - `avisos_ajenos`: cada aviso de otro vendedor con sus cambios de precio.
 *
 * Riesgo: ninguno. Dos columnas vacías y una tabla nueva.
 */
export class HistoriaDeAvisos1790000000034 implements MigrationInterface {
  name = 'HistoriaDeAvisos1790000000034';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "competidores" ADD COLUMN IF NOT EXISTS "leyendo_desde" timestamptz`);
    await q.query(`ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "dolar_comparacion" numeric(12,2)`);
    await q.query(`CREATE TABLE IF NOT EXISTS "avisos_ajenos" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "competidor_id" uuid NOT NULL,
      "company_id" uuid,
      "clave" varchar(500) NOT NULL,
      "titulo" varchar(160) NOT NULL,
      "marca" varchar(60),
      "anio" int,
      "km" int,
      "detalle" varchar(80),
      "url" varchar(500),
      "moneda" varchar(3) NOT NULL,
      "precio" numeric(14,2) NOT NULL,
      "precio_anterior" numeric(14,2),
      "cambio_at" timestamptz,
      "historia" jsonb NOT NULL DEFAULT '[]',
      "primera_vez_at" timestamptz NOT NULL,
      "ultima_vez_at" timestamptz NOT NULL,
      "activo" boolean NOT NULL DEFAULT true,
      "desaparecio_at" timestamptz
    )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_avisos_ajenos_clave" ON "avisos_ajenos" ("competidor_id", "clave")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_avisos_ajenos_empresa" ON "avisos_ajenos" ("company_id", "activo")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.dropTable('avisos_ajenos', true);
    await q.dropColumn('company', 'dolar_comparacion');
    await q.dropColumn('competidores', 'leyendo_desde');
  }
}
