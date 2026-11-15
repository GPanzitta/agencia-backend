import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sub-proyecto C — Pañol y compras. Una sola migración para todo el modelo de
 * la spec (2026-09-04-panol-y-compras-design.md §4), aunque los planes C1–C5
 * la consuman de a partes: dos migraciones a medias sobre las mismas tablas
 * son más difíciles de revertir que una entera.
 */
export class PanolYCompras1788200000000 implements MigrationInterface {
  name = 'PanolYCompras1788200000000';

  public async up(q: QueryRunner): Promise<void> {
    // ─── ingredients ────────────────────────────────────────────────────────
    await q.query(`ALTER TABLE "ingredients" ADD "precio_venta" numeric(10,2)`);
    await q.query(`ALTER TABLE "ingredients" ADD "ubicacion" character varying(40)`);
    await q.query(`ALTER TABLE "ingredients" ADD "marca" character varying(60)`);
    await q.query(`ALTER TABLE "ingredients" ADD "categoria" character varying(40)`);
    await q.query(`ALTER TABLE "ingredients" ADD "proveedor_principal_id" uuid`);
    await q.query(
      `ALTER TABLE "ingredients" ADD CONSTRAINT "FK_ingredients_proveedor_principal" FOREIGN KEY ("proveedor_principal_id") REFERENCES "proveedores"("id") ON DELETE SET NULL`,
    );
    await q.query(
      `CREATE INDEX "IDX_ingredients_company_ubicacion" ON "ingredients" ("company_id", "ubicacion")`,
    );

    // ─── company ────────────────────────────────────────────────────────────
    await q.query(
      `ALTER TABLE "company" ADD "margen_repuestos_porcentaje" integer NOT NULL DEFAULT 40`,
    );
    await q.query(
      `ALTER TABLE "company" ADD "alerta_suba_costo_porcentaje" integer NOT NULL DEFAULT 15`,
    );

    // ─── repair_order_repuestos ─────────────────────────────────────────────
    await q.query(
      `ALTER TABLE "repair_order_repuestos" ADD "consumido" boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `ALTER TABLE "repair_order_repuestos" ADD "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
    // Criterio conservador: si la orden ya salió de reparación, la salida de
    // stock ya ocurrió y ese renglón no reserva nada.
    await q.query(`
      UPDATE "repair_order_repuestos" r SET "consumido" = true
      FROM "repair_orders" o
      WHERE o."id" = r."order_id" AND o."estado" IN ('listo', 'entregada')
    `);

    // ─── purchase_orders ────────────────────────────────────────────────────
    await q.query(
      `ALTER TABLE "purchase_orders" ADD "cerrada_con_faltante" boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `ALTER TABLE "purchase_orders" ADD "fecha_entrega_estimada" TIMESTAMP WITH TIME ZONE`,
    );

    // ─── enums (Postgres ≥ 12 acepta ADD VALUE en transacción) ──────────────
    await q.query(
      `ALTER TYPE "public"."stock_movements_origen_enum" ADD VALUE IF NOT EXISTS 'devolucion_proveedor'`,
    );
    await q.query(
      `ALTER TYPE "public"."stock_movements_origen_enum" ADD VALUE IF NOT EXISTS 'recuperado'`,
    );
    for (const v of [
      'stock_ajustado',
      'repuesto_desactivado',
      'oc_editada',
      'oc_cerrada_con_faltante',
      'devolucion_proveedor',
    ]) {
      await q.query(`ALTER TYPE "audit_logs_accion_enum" ADD VALUE IF NOT EXISTS '${v}'`);
    }

    // ─── repuesto_compatibilidades ──────────────────────────────────────────
    await q.query(`
      CREATE TABLE "repuesto_compatibilidades" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "ingredient_id" uuid NOT NULL,
        "rubro_id" uuid,
        "marca" character varying(80) NOT NULL,
        "modelo" character varying(120),
        "origen" character varying(10) NOT NULL DEFAULT 'manual',
        "veces_usado" integer NOT NULL DEFAULT 1,
        "ultima_vez" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "company_id" uuid,
        CONSTRAINT "PK_repuesto_compatibilidades" PRIMARY KEY ("id"),
        CONSTRAINT "FK_rc_ingredient" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rc_rubro" FOREIGN KEY ("rubro_id") REFERENCES "tipos_equipo"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_rc_company" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);
    // Unique con modelo nulo: Postgres trata NULL ≠ NULL, así que se usa
    // COALESCE para que "toda la marca" no se duplique.
    await q.query(
      `CREATE UNIQUE INDEX "UQ_rc_ingredient_marca_modelo" ON "repuesto_compatibilidades" ("ingredient_id", "marca", COALESCE("modelo", ''), COALESCE("company_id", '00000000-0000-0000-0000-000000000000'))`,
    );
    await q.query(
      `CREATE INDEX "IDX_rc_company_marca_modelo" ON "repuesto_compatibilidades" ("company_id", "marca", "modelo")`,
    );

    // ─── purchase_devoluciones ──────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "purchase_devoluciones" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "purchase_order_id" uuid NOT NULL,
        "receipt_id" uuid,
        "fecha" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "resolucion" character varying(15) NOT NULL,
        "numero_nota_credito" character varying(60),
        "monto" numeric(12,2) NOT NULL DEFAULT 0,
        "motivo" character varying(250) NOT NULL,
        "aplicada_al_gasto" boolean NOT NULL DEFAULT false,
        "devuelto_por" uuid,
        "company_id" uuid,
        CONSTRAINT "PK_purchase_devoluciones" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pd_oc" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pd_receipt" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_pd_user" FOREIGN KEY ("devuelto_por") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_pd_company" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_pd_oc" ON "purchase_devoluciones" ("purchase_order_id")`);
    await q.query(`
      CREATE TABLE "purchase_devolucion_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "devolucion_id" uuid NOT NULL,
        "ingredient_id" uuid NOT NULL,
        "cantidad" numeric(10,2) NOT NULL,
        "precio_unitario" numeric(10,2) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_purchase_devolucion_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pdi_devolucion" FOREIGN KEY ("devolucion_id") REFERENCES "purchase_devoluciones"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pdi_ingredient" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT
      )
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "purchase_devolucion_items"`);
    await q.query(`DROP TABLE "purchase_devoluciones"`);
    await q.query(`DROP TABLE "repuesto_compatibilidades"`);
    // Los valores de enum no se remueven: Postgres no soporta DROP VALUE.
    await q.query(`ALTER TABLE "purchase_orders" DROP COLUMN "fecha_entrega_estimada"`);
    await q.query(`ALTER TABLE "purchase_orders" DROP COLUMN "cerrada_con_faltante"`);
    await q.query(`ALTER TABLE "repair_order_repuestos" DROP COLUMN "creado_en"`);
    await q.query(`ALTER TABLE "repair_order_repuestos" DROP COLUMN "consumido"`);
    await q.query(`ALTER TABLE "company" DROP COLUMN "alerta_suba_costo_porcentaje"`);
    await q.query(`ALTER TABLE "company" DROP COLUMN "margen_repuestos_porcentaje"`);
    await q.query(`DROP INDEX "public"."IDX_ingredients_company_ubicacion"`);
    await q.query(`ALTER TABLE "ingredients" DROP CONSTRAINT "FK_ingredients_proveedor_principal"`);
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN "proveedor_principal_id"`);
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN "categoria"`);
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN "marca"`);
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN "ubicacion"`);
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN "precio_venta"`);
  }
}
