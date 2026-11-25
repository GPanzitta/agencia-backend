import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agencia (24/11/2026):
 * 1. `operaciones.fotos`: galería de fotos y comprobantes por etapa en la Orden de Venta (OV).
 * 2. Tablas del módulo de Taller, Órdenes de Servicio/Alistaje, Pañol de Repuestos (con fotos)
 *    y Órdenes de Compra (OC) atadas a orden:
 *    - `repuestos_auto`
 *    - `ordenes_alistaje`
 *    - `ordenes_alistaje_repuestos`
 *    - `ordenes_compra_taller`
 *
 * Riesgo: ninguno. Todas las sentencias usan `IF NOT EXISTS`.
 */
export class TallerYOrdenVentaFotos1790000000035 implements MigrationInterface {
  name = 'TallerYOrdenVentaFotos1790000000035';

  async up(q: QueryRunner): Promise<void> {
    // 1. Fotos adjuntas en Órdenes de Venta (operaciones)
    await q.query(
      `ALTER TABLE "operaciones" ADD COLUMN IF NOT EXISTS "fotos" jsonb NOT NULL DEFAULT '[]'`,
    );

    // 2. Pañol de Repuestos Automotrices (con galería de fotos)
    await q.query(`
      CREATE TABLE IF NOT EXISTS "repuestos_auto" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "codigo" varchar(60),
        "nombre" varchar(140) NOT NULL,
        "categoria" varchar(40) NOT NULL DEFAULT 'filtros_fluidos',
        "marca" varchar(60),
        "compatibilidad" varchar(160),
        "ubicacion" varchar(60),
        "unidad_medida" varchar(20) NOT NULL DEFAULT 'un',
        "stock" numeric(10,2) NOT NULL DEFAULT 0,
        "stock_minimo" numeric(10,2) NOT NULL DEFAULT 1,
        "moneda" varchar(3) NOT NULL DEFAULT 'ARS',
        "costo" numeric(14,2) NOT NULL DEFAULT 0,
        "proveedor" varchar(120),
        "fotos" jsonb NOT NULL DEFAULT '[]',
        "activo" boolean NOT NULL DEFAULT true,
        "company_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_repuestos_auto" PRIMARY KEY ("id"),
        CONSTRAINT "FK_repuestos_auto_company" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_repuestos_auto_montos" CHECK ("costo" >= 0 AND "stock" >= 0 AND "stock_minimo" >= 0)
      )
    `);
    await q.query(
      `ALTER TABLE "repuestos_auto" ADD COLUMN IF NOT EXISTS "fotos" jsonb NOT NULL DEFAULT '[]'`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_repuestos_auto_company_activo" ON "repuestos_auto" ("company_id", "activo")`,
    );

    // 3. Órdenes de Alistaje y Servicio de Taller (unidades del stock o clientes externos)
    await q.query(`
      CREATE TABLE IF NOT EXISTS "ordenes_alistaje" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "numero" varchar(20) NOT NULL,
        "tipo_origen" varchar(14) NOT NULL DEFAULT 'stock',
        "unidad_id" uuid,
        "cliente_externo" jsonb,
        "vehiculo_externo" jsonb,
        "estado" varchar(20) NOT NULL DEFAULT 'recibida',
        "prioridad" varchar(20) NOT NULL DEFAULT 'normal',
        "sector" varchar(60) NOT NULL DEFAULT 'Service y alistaje de ingreso',
        "responsable" varchar(120),
        "falla_motivo" text NOT NULL,
        "diagnostico" text,
        "trabajo_realizado" text,
        "km_ingreso" integer,
        "moneda" varchar(3) NOT NULL DEFAULT 'ARS',
        "costo_mano_obra" numeric(14,2) NOT NULL DEFAULT 0,
        "tipo_cambio" numeric(14,2),
        "gasto_unidad_id" uuid,
        "checklist" jsonb NOT NULL DEFAULT '[]',
        "fotos" jsonb NOT NULL DEFAULT '[]',
        "bitacora" jsonb NOT NULL DEFAULT '[]',
        "finalizada_at" timestamptz,
        "autor_id" uuid,
        "company_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ordenes_alistaje" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ordenes_alistaje_unidad" FOREIGN KEY ("unidad_id") REFERENCES "unidades"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ordenes_alistaje_autor" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_ordenes_alistaje_company" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_ordenes_alistaje_mano_obra" CHECK ("costo_mano_obra" >= 0)
      )
    `);
    await q.query(
      `ALTER TABLE "ordenes_alistaje" ADD COLUMN IF NOT EXISTS "tipo_origen" varchar(14) NOT NULL DEFAULT 'stock'`,
    );
    await q.query(
      `ALTER TABLE "ordenes_alistaje" ADD COLUMN IF NOT EXISTS "cliente_externo" jsonb`,
    );
    await q.query(
      `ALTER TABLE "ordenes_alistaje" ADD COLUMN IF NOT EXISTS "vehiculo_externo" jsonb`,
    );
    await q.query(
      `ALTER TABLE "ordenes_alistaje" ALTER COLUMN "unidad_id" DROP NOT NULL`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ordenes_alistaje_company_estado" ON "ordenes_alistaje" ("company_id", "estado")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ordenes_alistaje_unidad" ON "ordenes_alistaje" ("unidad_id")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ordenes_alistaje_numero" ON "ordenes_alistaje" ("company_id", "numero")`,
    );

    // 4. Renglones de repuestos asignados/consumidos en cada Orden de Alistaje
    await q.query(`
      CREATE TABLE IF NOT EXISTS "ordenes_alistaje_repuestos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "orden_id" uuid NOT NULL,
        "repuesto_id" uuid,
        "codigo" varchar(60),
        "nombre" varchar(140) NOT NULL,
        "cantidad" numeric(10,2) NOT NULL DEFAULT 1,
        "moneda" varchar(3) NOT NULL DEFAULT 'ARS',
        "costo_unitario" numeric(14,2) NOT NULL DEFAULT 0,
        "ingresado" boolean NOT NULL DEFAULT true,
        "consumido" boolean NOT NULL DEFAULT true,
        "compra_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ordenes_alistaje_repuestos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ordenes_alistaje_repuestos_orden" FOREIGN KEY ("orden_id") REFERENCES "ordenes_alistaje"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ordenes_alistaje_repuestos_repuesto" FOREIGN KEY ("repuesto_id") REFERENCES "repuestos_auto"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_orden_alistaje_repuestos_montos" CHECK ("cantidad" > 0 AND "costo_unitario" >= 0)
      )
    `);
    await q.query(
      `ALTER TABLE "ordenes_alistaje_repuestos" ADD COLUMN IF NOT EXISTS "ingresado" boolean NOT NULL DEFAULT true`,
    );
    await q.query(
      `ALTER TABLE "ordenes_alistaje_repuestos" ADD COLUMN IF NOT EXISTS "consumido" boolean NOT NULL DEFAULT true`,
    );
    await q.query(
      `ALTER TABLE "ordenes_alistaje_repuestos" ADD COLUMN IF NOT EXISTS "compra_id" uuid`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ordenes_alistaje_repuestos_orden" ON "ordenes_alistaje_repuestos" ("orden_id")`,
    );

    // 5. Órdenes de Compra de Repuestos (OC) atadas a una Orden de Servicio o generales de Pañol
    await q.query(`
      CREATE TABLE IF NOT EXISTS "ordenes_compra_taller" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "numero" varchar(20) NOT NULL,
        "orden_id" uuid,
        "proveedor" varchar(140) NOT NULL,
        "numero_remito" varchar(60),
        "estado" varchar(16) NOT NULL DEFAULT 'pendiente',
        "moneda" varchar(3) NOT NULL DEFAULT 'ARS',
        "monto_total" numeric(14,2) NOT NULL DEFAULT 0,
        "items" jsonb NOT NULL DEFAULT '[]',
        "notas" text,
        "recibida_at" timestamptz,
        "autor_id" uuid,
        "company_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ordenes_compra_taller" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ordenes_compra_taller_orden" FOREIGN KEY ("orden_id") REFERENCES "ordenes_alistaje"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_ordenes_compra_taller_autor" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_ordenes_compra_taller_company" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_ordenes_compra_taller_total" CHECK ("monto_total" >= 0)
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ordenes_compra_taller_company_estado" ON "ordenes_compra_taller" ("company_id", "estado")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ordenes_compra_taller_orden" ON "ordenes_compra_taller" ("orden_id")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ordenes_compra_taller_numero" ON "ordenes_compra_taller" ("company_id", "numero")`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.dropTable('ordenes_compra_taller', true);
    await q.dropTable('ordenes_alistaje_repuestos', true);
    await q.dropTable('ordenes_alistaje', true);
    await q.dropTable('repuestos_auto', true);
    await q.query(`ALTER TABLE "operaciones" DROP COLUMN IF EXISTS "fotos"`);
  }
}
