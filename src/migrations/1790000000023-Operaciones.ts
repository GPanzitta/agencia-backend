import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agencia (diseño del 12/11/2026): las fotos de la unidad y las operaciones de
 * venta (reserva con seña, pagos mixtos en dos monedas, usado en parte de pago).
 *
 * Riesgo: ninguno sobre lo existente. Tres tablas nuevas.
 */
export class Operaciones1790000000023 implements MigrationInterface {
  name = 'Operaciones1790000000023';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "unidades_fotos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "unidad_id" uuid NOT NULL,
        "url" varchar(300) NOT NULL,
        "url_miniatura" varchar(300) NOT NULL,
        "orden" integer NOT NULL DEFAULT 0,
        "autor_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_unidades_fotos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_unidades_fotos_unidad" FOREIGN KEY ("unidad_id") REFERENCES "unidades"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_unidades_fotos_unidad" ON "unidades_fotos" ("unidad_id")`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "operaciones" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid,
        "numero" varchar(20) NOT NULL,
        "unidad_id" uuid NOT NULL,
        "estado" varchar(10) NOT NULL DEFAULT 'reservada',
        "cliente_nombre" varchar(120) NOT NULL,
        "cliente_telefono" varchar(40),
        "cliente_documento" varchar(20),
        "precio" numeric(14,2) NOT NULL,
        "moneda" varchar(3) NOT NULL,
        "reserva_vence" date,
        "vendedor_id" uuid,
        "comision" numeric(14,2),
        "notas" text,
        "cerrada_at" timestamptz,
        "anulada_at" timestamptz,
        "anulada_motivo" varchar(300),
        "autor_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_operaciones" PRIMARY KEY ("id"),
        CONSTRAINT "FK_operaciones_company" FOREIGN KEY ("company_id") REFERENCES "company"("id"),
        CONSTRAINT "FK_operaciones_unidad" FOREIGN KEY ("unidad_id") REFERENCES "unidades"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_operaciones_vendedor" FOREIGN KEY ("vendedor_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_operaciones_estado" CHECK ("estado" IN ('reservada', 'vendida', 'anulada')),
        CONSTRAINT "CHK_operaciones_montos" CHECK ("precio" > 0 AND "moneda" IN ('ARS', 'USD') AND ("comision" IS NULL OR "comision" >= 0))
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_operaciones_company_estado" ON "operaciones" ("company_id", "estado")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_operaciones_unidad" ON "operaciones" ("unidad_id")`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_operaciones_numero" ON "operaciones" ("company_id", "numero")`);
    // Una unidad no puede tener dos operaciones vivas a la vez.
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_operaciones_unidad_viva" ON "operaciones" ("unidad_id") WHERE "estado" IN ('reservada', 'vendida')`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "operaciones_pagos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "operacion_id" uuid NOT NULL,
        "medio" varchar(14) NOT NULL,
        "monto" numeric(14,2) NOT NULL,
        "moneda" varchar(3) NOT NULL,
        "tipo_cambio" numeric(12,2),
        "wallet_id" uuid,
        "unidad_toma_id" uuid,
        "detalle" varchar(200),
        "autor_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_operaciones_pagos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_operaciones_pagos_operacion" FOREIGN KEY ("operacion_id") REFERENCES "operaciones"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_operaciones_pagos_toma" FOREIGN KEY ("unidad_toma_id") REFERENCES "unidades"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_operaciones_pagos_medio" CHECK ("medio" IN ('efectivo', 'transferencia', 'cheque', 'credito', 'usado', 'otro')),
        CONSTRAINT "CHK_operaciones_pagos_monto" CHECK ("monto" > 0 AND "moneda" IN ('ARS', 'USD') AND ("tipo_cambio" IS NULL OR "tipo_cambio" > 0)),
        CONSTRAINT "CHK_operaciones_pagos_usado" CHECK (("medio" = 'usado') = ("unidad_toma_id" IS NOT NULL) OR "medio" = 'usado')
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_operaciones_pagos_operacion" ON "operaciones_pagos" ("operacion_id")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.dropTable('operaciones_pagos', true);
    await q.dropTable('operaciones', true);
    await q.dropTable('unidades_fotos', true);
  }
}
