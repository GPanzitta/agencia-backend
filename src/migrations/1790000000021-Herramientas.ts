import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Herramientas e instrumental (programa de módulos del 09/11/2026, módulo 3):
 * el inventario de herramientas del taller (no repuestos), a qué técnico están
 * prestadas, y el service o la calibración con vencimiento.
 *
 * Riesgo: ninguno sobre lo existente. Dos tablas nuevas.
 */
export class Herramientas1790000000021 implements MigrationInterface {
  name = 'Herramientas1790000000021';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "herramientas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid,
        "numero" varchar(12) NOT NULL,
        "nombre" varchar(120) NOT NULL,
        "marca" varchar(80),
        "modelo" varchar(120),
        "numero_serie" varchar(120),
        "valor" numeric(12,2),
        "fecha_compra" date,
        "estado" varchar(12) NOT NULL DEFAULT 'disponible',
        "control_cada_meses" smallint,
        "ultimo_control" date,
        "tecnico_id" uuid,
        "prestada_desde" timestamptz,
        "baja_motivo" varchar(12),
        "baja_detalle" text,
        "baja_at" timestamptz,
        "notas" text,
        "autor_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_herramientas" PRIMARY KEY ("id"),
        CONSTRAINT "FK_herramientas_company" FOREIGN KEY ("company_id") REFERENCES "company"("id"),
        CONSTRAINT "FK_herramientas_tecnico" FOREIGN KEY ("tecnico_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_herramientas_autor" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_herramientas_estado" CHECK ("estado" IN ('disponible', 'prestada', 'en_service', 'baja')),
        CONSTRAINT "CHK_herramientas_baja_motivo" CHECK ("baja_motivo" IS NULL OR "baja_motivo" IN ('perdida', 'rotura', 'desgaste', 'otro')),
        CONSTRAINT "CHK_herramientas_valores" CHECK (("valor" IS NULL OR "valor" >= 0) AND ("control_cada_meses" IS NULL OR "control_cada_meses" BETWEEN 1 AND 120)),
        CONSTRAINT "CHK_herramientas_control" CHECK ("control_cada_meses" IS NULL OR "ultimo_control" IS NOT NULL),
        CONSTRAINT "CHK_herramientas_prestada" CHECK (("estado" = 'prestada') = ("tecnico_id" IS NOT NULL))
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_herramientas_company_estado" ON "herramientas" ("company_id", "estado")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_herramientas_tecnico" ON "herramientas" ("tecnico_id") WHERE "tecnico_id" IS NOT NULL`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_herramientas_numero" ON "herramientas" ("company_id", "numero")`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "herramientas_movimientos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid,
        "herramienta_id" uuid NOT NULL,
        "tipo" varchar(12) NOT NULL,
        "tecnico_id" uuid,
        "detalle" text,
        "costo" numeric(12,2),
        "fecha" date,
        "autor_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_herramientas_movimientos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_herramientas_movimientos_company" FOREIGN KEY ("company_id") REFERENCES "company"("id"),
        CONSTRAINT "FK_herramientas_movimientos_herramienta" FOREIGN KEY ("herramienta_id") REFERENCES "herramientas"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_herramientas_movimientos_tecnico" FOREIGN KEY ("tecnico_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_herramientas_movimientos_autor" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_herramientas_movimientos_tipo" CHECK ("tipo" IN ('alta', 'prestamo', 'devolucion', 'a_service', 'control', 'baja')),
        CONSTRAINT "CHK_herramientas_movimientos_costo" CHECK ("costo" IS NULL OR "costo" >= 0)
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_herramientas_movimientos_herramienta" ON "herramientas_movimientos" ("herramienta_id", "created_at")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "herramientas_movimientos"`);
    await q.query(`DROP TABLE IF EXISTS "herramientas"`);
  }
}