import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Segunda vida (programa de módulos del 09/11/2026, módulo 2): los equipos
 * usados que pasan a ser del taller (canje o cesión), sus costos de
 * reacondicionamiento y un origen de stock propio para la entrada del equipo
 * cuando se pone a la venta.
 *
 * Riesgo: ninguno sobre lo existente. Dos tablas nuevas y un valor nuevo en el
 * enum de orígenes de stock (ADD VALUE no toca las filas que ya están).
 */
export class SegundaVida1790000000020 implements MigrationInterface {
  name = 'SegundaVida1790000000020';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "stock_movements_origen_enum" ADD VALUE IF NOT EXISTS 'segunda_vida'`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "equipos_del_taller" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid,
        "numero" varchar(20) NOT NULL,
        "origen" varchar(10) NOT NULL,
        "estado" varchar(20) NOT NULL DEFAULT 'en_espera',
        "tipo" varchar(80) NOT NULL,
        "marca" varchar(80),
        "modelo" varchar(120),
        "numero_serie" varchar(120),
        "estado_al_entrar" text,
        "cliente_nombre" varchar(120),
        "cliente_telefono" varchar(40),
        "order_id" uuid,
        "venta_id" uuid,
        "valor_toma" numeric(12,2) NOT NULL DEFAULT 0,
        "garantia_meses" smallint NOT NULL DEFAULT 3,
        "precio_venta" numeric(12,2),
        "ingredient_id" uuid,
        "desguace_id" uuid,
        "notas" text,
        "autor_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_equipos_del_taller" PRIMARY KEY ("id"),
        CONSTRAINT "FK_equipos_del_taller_company" FOREIGN KEY ("company_id") REFERENCES "company"("id"),
        CONSTRAINT "FK_equipos_del_taller_orden" FOREIGN KEY ("order_id") REFERENCES "repair_orders"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_equipos_del_taller_venta" FOREIGN KEY ("venta_id") REFERENCES "ventas_tienda"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_equipos_del_taller_producto" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_equipos_del_taller_desguace" FOREIGN KEY ("desguace_id") REFERENCES "desguaces"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_equipos_del_taller_autor" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_equipos_del_taller_origen" CHECK ("origen" IN ('canje', 'cesion')),
        CONSTRAINT "CHK_equipos_del_taller_estado" CHECK ("estado" IN ('en_espera', 'reacondicionando', 'a_la_venta', 'desguazado', 'descartado')),
        CONSTRAINT "CHK_equipos_del_taller_montos" CHECK ("valor_toma" >= 0 AND ("precio_venta" IS NULL OR "precio_venta" >= 0) AND "garantia_meses" BETWEEN 0 AND 120)
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_equipos_del_taller_company_estado" ON "equipos_del_taller" ("company_id", "estado")`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_equipos_del_taller_numero" ON "equipos_del_taller" ("company_id", "numero")`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_equipos_del_taller_orden" ON "equipos_del_taller" ("order_id") WHERE "order_id" IS NOT NULL`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "equipos_del_taller_costos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "equipo_id" uuid NOT NULL,
        "descripcion" varchar(200) NOT NULL,
        "monto" numeric(12,2) NOT NULL,
        "autor_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_equipos_del_taller_costos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_equipos_del_taller_costos_equipo" FOREIGN KEY ("equipo_id") REFERENCES "equipos_del_taller"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_equipos_del_taller_costos_autor" FOREIGN KEY ("autor_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_equipos_del_taller_costos_monto" CHECK ("monto" >= 0)
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_equipos_del_taller_costos_equipo" ON "equipos_del_taller_costos" ("equipo_id")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "equipos_del_taller_costos"`);
    await q.query(`DROP TABLE IF EXISTS "equipos_del_taller"`);
    // Postgres no saca valores de un enum: 'segunda_vida' queda, sin uso.
  }
}