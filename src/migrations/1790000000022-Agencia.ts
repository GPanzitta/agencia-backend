import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El corazón de la agencia (diseño del 12/11/2026): las unidades (autos en
 * stock) con sus gastos de alistaje.
 *
 * Riesgo: ninguno sobre lo existente. Dos tablas nuevas.
 */
export class Agencia1790000000022 implements MigrationInterface {
  name = 'Agencia1790000000022';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "unidades" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid,
        "numero" varchar(12) NOT NULL,
        "dominio" varchar(10),
        "marca" varchar(60) NOT NULL,
        "modelo" varchar(80) NOT NULL,
        "version" varchar(120),
        "anio" smallint NOT NULL,
        "km" integer NOT NULL DEFAULT 0,
        "color" varchar(40),
        "combustible" varchar(20),
        "transmision" varchar(20),
        "carroceria" varchar(30),
        "nro_motor" varchar(40),
        "nro_chasis" varchar(40),
        "condicion" varchar(6) NOT NULL DEFAULT 'usado',
        "origen" varchar(14) NOT NULL,
        "estado" varchar(12) NOT NULL DEFAULT 'ingreso',
        "moneda" varchar(3) NOT NULL DEFAULT 'USD',
        "costo_adquisicion" numeric(14,2) NOT NULL DEFAULT 0,
        "precio_piso" numeric(14,2),
        "precio_venta" numeric(14,2),
        "titular_nombre" varchar(120),
        "titular_telefono" varchar(40),
        "titular_documento" varchar(20),
        "operacion_origen_id" uuid,
        "papeles" jsonb NOT NULL DEFAULT '{}',
        "publicada" boolean NOT NULL DEFAULT false,
        "descripcion" text,
        "ubicacion" varchar(80),
        "notas" text,
        "fecha_ingreso" date NOT NULL DEFAULT CURRENT_DATE,
        "fecha_venta" date,
        "autor_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_unidades" PRIMARY KEY ("id"),
        CONSTRAINT "FK_unidades_company" FOREIGN KEY ("company_id") REFERENCES "company"("id"),
        CONSTRAINT "FK_unidades_autor" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_unidades_condicion" CHECK ("condicion" IN ('usado', '0km')),
        CONSTRAINT "CHK_unidades_origen" CHECK ("origen" IN ('compra', 'toma', 'consignacion')),
        CONSTRAINT "CHK_unidades_estado" CHECK ("estado" IN ('ingreso', 'alistaje', 'disponible', 'reservada', 'vendida', 'devuelta', 'baja')),
        CONSTRAINT "CHK_unidades_moneda" CHECK ("moneda" IN ('ARS', 'USD')),
        CONSTRAINT "CHK_unidades_montos" CHECK ("costo_adquisicion" >= 0 AND ("precio_piso" IS NULL OR "precio_piso" >= 0) AND ("precio_venta" IS NULL OR "precio_venta" > 0)),
        CONSTRAINT "CHK_unidades_anio_km" CHECK ("anio" BETWEEN 1900 AND 2100 AND "km" >= 0),
        CONSTRAINT "CHK_unidades_publicada" CHECK (NOT "publicada" OR ("estado" IN ('disponible', 'reservada') AND "precio_venta" IS NOT NULL))
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_unidades_company_estado" ON "unidades" ("company_id", "estado")`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_unidades_numero" ON "unidades" ("company_id", "numero")`);
    // Un mismo dominio no puede estar dos veces en stock; sí puede volver a entrar después de vendido.
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_unidades_dominio_en_stock" ON "unidades" ("company_id", "dominio") WHERE "dominio" IS NOT NULL AND "estado" IN ('ingreso', 'alistaje', 'disponible', 'reservada')`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "unidades_gastos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "unidad_id" uuid NOT NULL,
        "descripcion" varchar(200) NOT NULL,
        "monto" numeric(14,2) NOT NULL,
        "moneda" varchar(3) NOT NULL,
        "tipo_cambio" numeric(12,2),
        "autor_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_unidades_gastos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_unidades_gastos_unidad" FOREIGN KEY ("unidad_id") REFERENCES "unidades"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_unidades_gastos_autor" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_unidades_gastos_monto" CHECK ("monto" > 0 AND "moneda" IN ('ARS', 'USD') AND ("tipo_cambio" IS NULL OR "tipo_cambio" > 0))
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_unidades_gastos_unidad" ON "unidades_gastos" ("unidad_id")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.dropTable('unidades_gastos', true);
    await q.dropTable('unidades', true);
  }
}
