import { randomUUID } from 'node:crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

import { armarRelleno, DatosRelleno } from '../ventas-tienda/relleno-ventas.util';

/**
 * Venta de mostrador, cobro mixto, seña, devolución parcial y pagos de MP sin
 * aplicar (spec 2026-10-02 §3). Una sola migración: columnas nuevas, cuatro
 * tablas, el origen `devolucion_venta` del ledger, el tope de descuento y el
 * relleno de §3.6, que arma `armarRelleno` (puro y testeado).
 *
 * El relleno no toca asientos ni stock: sólo describe con filas nuevas lo que
 * ya pasó. Lee `cancelado_motivo` ANTES de moverlo a `devolucion_motivo`.
 */
export class VentaMostrador1789800000008 implements MigrationInterface {
  name = 'VentaMostrador1789800000008';

  public async up(q: QueryRunner): Promise<void> {
    // ─── Ledger ─────────────────────────────────────────────────────────────
    // El valor nuevo no se usa en esta transacción (Postgres no lo permitiría):
    // el relleno apunta a los asientos `anulacion_pago` que ya existen.
    await q.query(`ALTER TYPE "public"."wallet_movements_origen_enum" ADD VALUE IF NOT EXISTS 'devolucion_venta'`);

    // ─── ventas_tienda ──────────────────────────────────────────────────────
    await q.query(`ALTER TABLE "ventas_tienda"
        ADD "canal" character varying(12) NOT NULL DEFAULT 'online',
        ADD "customer_id" uuid,
        ADD "vendido_por" uuid,
        ADD "devolucion_motivo" text`);
    await q.query(`ALTER TABLE "ventas_tienda" ADD CONSTRAINT "FK_ventas_tienda_cliente"
        FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL`);
    await q.query(`ALTER TABLE "ventas_tienda" ADD CONSTRAINT "FK_ventas_tienda_vendido_por"
        FOREIGN KEY ("vendido_por") REFERENCES "users"("id") ON DELETE SET NULL`);
    await q.query(`CREATE INDEX "IDX_ventas_tienda_cliente" ON "ventas_tienda" ("customer_id")`);

    // ─── ventas_tienda_items ────────────────────────────────────────────────
    await q.query(`ALTER TABLE "ventas_tienda_items"
        ADD "precio_lista" numeric(12,2),
        ADD "descuento_por" uuid,
        ADD "cantidad_devuelta" numeric(12,3) NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE "ventas_tienda_items" ADD CONSTRAINT "FK_ventas_tienda_items_descuento_por"
        FOREIGN KEY ("descuento_por") REFERENCES "users"("id") ON DELETE SET NULL`);

    // ─── venta_cobros ───────────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "venta_cobros" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "venta_id" uuid NOT NULL,
        "wallet_id" uuid NOT NULL,
        "monto" numeric(12,2) NOT NULL,
        "tipo" character varying(10) NOT NULL,
        "movimiento_id" uuid,
        "mp_payment_id" character varying(60),
        "cobrado_por" uuid,
        "company_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_venta_cobros" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_venta_cobros_monto" CHECK ("monto" > 0),
        CONSTRAINT "CHK_venta_cobros_tipo" CHECK ("tipo" IN ('total', 'sena', 'saldo')),
        CONSTRAINT "FK_venta_cobros_venta" FOREIGN KEY ("venta_id") REFERENCES "ventas_tienda"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_venta_cobros_wallet" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id"),
        CONSTRAINT "FK_venta_cobros_movimiento" FOREIGN KEY ("movimiento_id") REFERENCES "wallet_movements"("id"),
        CONSTRAINT "FK_venta_cobros_cobrado_por" FOREIGN KEY ("cobrado_por") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_venta_cobros_empresa" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX "IDX_venta_cobros_venta" ON "venta_cobros" ("venta_id")`);
    await q.query(`CREATE INDEX "IDX_venta_cobros_empresa" ON "venta_cobros" ("company_id")`);

    // ─── venta_devoluciones ─────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "venta_devoluciones" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "venta_id" uuid NOT NULL,
        "monto" numeric(12,2) NOT NULL,
        "wallet_id" uuid,
        "movimiento_id" uuid,
        "motivo" text NOT NULL,
        "devuelto_por" uuid,
        "company_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_venta_devoluciones" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_venta_devoluciones_monto" CHECK ("monto" >= 0),
        CONSTRAINT "CHK_venta_devoluciones_billetera" CHECK ("monto" = 0 OR "wallet_id" IS NOT NULL),
        CONSTRAINT "FK_venta_devoluciones_venta" FOREIGN KEY ("venta_id") REFERENCES "ventas_tienda"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_venta_devoluciones_wallet" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id"),
        CONSTRAINT "FK_venta_devoluciones_movimiento" FOREIGN KEY ("movimiento_id") REFERENCES "wallet_movements"("id"),
        CONSTRAINT "FK_venta_devoluciones_devuelto_por" FOREIGN KEY ("devuelto_por") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_venta_devoluciones_empresa" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX "IDX_venta_devoluciones_venta" ON "venta_devoluciones" ("venta_id")`);
    await q.query(`CREATE INDEX "IDX_venta_devoluciones_empresa" ON "venta_devoluciones" ("company_id")`);

    await q.query(`
      CREATE TABLE "venta_devolucion_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "devolucion_id" uuid NOT NULL,
        "item_id" uuid NOT NULL,
        "cantidad" numeric(12,3) NOT NULL,
        "reingresa_stock" boolean NOT NULL,
        CONSTRAINT "PK_venta_devolucion_items" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_venta_devolucion_items_cantidad" CHECK ("cantidad" > 0),
        CONSTRAINT "FK_venta_devolucion_items_devolucion" FOREIGN KEY ("devolucion_id") REFERENCES "venta_devoluciones"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_venta_devolucion_items_item" FOREIGN KEY ("item_id") REFERENCES "ventas_tienda_items"("id") ON DELETE CASCADE
      )`);

    // ─── pagos_sin_aplicar ──────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "pagos_sin_aplicar" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "mp_payment_id" character varying(60) NOT NULL,
        "venta_id" uuid,
        "monto" numeric(12,2),
        "estado_venta" character varying(20),
        "motivo" character varying(40) NOT NULL,
        "resolucion" character varying(20),
        "nota" text,
        "resuelto_por" uuid,
        "resuelto_at" TIMESTAMP WITH TIME ZONE,
        "company_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pagos_sin_aplicar" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pagos_sin_aplicar_venta" FOREIGN KEY ("venta_id") REFERENCES "ventas_tienda"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_pagos_sin_aplicar_resuelto_por" FOREIGN KEY ("resuelto_por") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_pagos_sin_aplicar_empresa" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE UNIQUE INDEX "UQ_pagos_sin_aplicar_mp_payment" ON "pagos_sin_aplicar" ("mp_payment_id")`);
    await q.query(`CREATE INDEX "IDX_pagos_sin_aplicar_empresa" ON "pagos_sin_aplicar" ("company_id")`);

    // ─── company ────────────────────────────────────────────────────────────
    await q.query(`ALTER TABLE "company" ADD "descuento_maximo_mostrador" numeric(5,2) NOT NULL DEFAULT 10`);

    // ─── Relleno (§3.6) ─────────────────────────────────────────────────────
    // Toda venta existente ya quedó `canal = 'online'` por el DEFAULT.
    const datos: DatosRelleno = {
      ventas: await q.query(`SELECT "id", "company_id", "estado", "total", "wallet_id", "mp_payment_id", "pagado_at",
                                    "entregado_at", "devuelto_at", "updated_at", "created_at", "entregado_por", "cancelado_motivo"
                               FROM "ventas_tienda"`),
      items: await q.query(`SELECT "id", "venta_id", "cantidad", "ingredient_id" FROM "ventas_tienda_items"`),
      movimientosVenta: await q.query(`SELECT "id", "origen_id" FROM "wallet_movements"
                                        WHERE "origen" = 'venta' AND "signo" = 'ingreso' AND "origen_id" IS NOT NULL
                                        ORDER BY "fecha" ASC`),
      anulaciones: await q.query(`SELECT "id", "origen_id" FROM "wallet_movements"
                                   WHERE "origen" = 'anulacion_pago' AND "origen_id" IS NOT NULL`),
      ventasConReingreso: (
        await q.query(`SELECT DISTINCT "origen_id" FROM "stock_movements"
                        WHERE "origen" = 'devolucion_venta' AND "origen_id" IS NOT NULL`)
      ).map((f: { origen_id: string }) => f.origen_id),
    };
    const r = armarRelleno(datos, () => randomUUID());

    for (const c of r.cobros) {
      await q.query(
        `INSERT INTO "venta_cobros" ("venta_id", "wallet_id", "monto", "tipo", "movimiento_id", "mp_payment_id", "cobrado_por", "created_at", "company_id")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [c.venta_id, c.wallet_id, c.monto, c.tipo, c.movimiento_id, c.mp_payment_id, c.cobrado_por, c.created_at, c.company_id],
      );
    }
    for (const d of r.devoluciones) {
      await q.query(
        `INSERT INTO "venta_devoluciones" ("id", "venta_id", "monto", "wallet_id", "movimiento_id", "motivo", "devuelto_por", "created_at", "company_id")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [d.id, d.venta_id, d.monto, d.wallet_id, d.movimiento_id, d.motivo, d.devuelto_por, d.created_at, d.company_id],
      );
    }
    for (const i of r.devolucionItems) {
      await q.query(
        `INSERT INTO "venta_devolucion_items" ("devolucion_id", "item_id", "cantidad", "reingresa_stock") VALUES ($1, $2, $3, $4)`,
        [i.devolucion_id, i.item_id, i.cantidad, i.reingresa_stock],
      );
    }
    if (r.itemsDevueltos.length) {
      await q.query(`UPDATE "ventas_tienda_items" SET "cantidad_devuelta" = "cantidad" WHERE "id" = ANY($1::uuid[])`, [r.itemsDevueltos]);
    }
    // Recién ahora: el relleno ya leyó `cancelado_motivo` como motivo de la devolución.
    await q.query(`UPDATE "ventas_tienda" SET "devolucion_motivo" = "cancelado_motivo", "cancelado_motivo" = NULL
                    WHERE "estado" = 'devuelta'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE "ventas_tienda" SET "cancelado_motivo" = "devolucion_motivo"
                    WHERE "estado" = 'devuelta' AND "devolucion_motivo" IS NOT NULL`);
    await q.query(`ALTER TABLE "company" DROP COLUMN "descuento_maximo_mostrador"`);
    await q.query(`DROP TABLE "pagos_sin_aplicar"`);
    await q.query(`DROP TABLE "venta_devolucion_items"`);
    await q.query(`DROP TABLE "venta_devoluciones"`);
    await q.query(`DROP TABLE "venta_cobros"`);
    await q.query(`ALTER TABLE "ventas_tienda_items" DROP CONSTRAINT "FK_ventas_tienda_items_descuento_por"`);
    await q.query(`ALTER TABLE "ventas_tienda_items" DROP COLUMN "cantidad_devuelta", DROP COLUMN "descuento_por", DROP COLUMN "precio_lista"`);
    await q.query(`DROP INDEX "IDX_ventas_tienda_cliente"`);
    await q.query(`ALTER TABLE "ventas_tienda" DROP CONSTRAINT "FK_ventas_tienda_vendido_por"`);
    await q.query(`ALTER TABLE "ventas_tienda" DROP CONSTRAINT "FK_ventas_tienda_cliente"`);
    await q.query(`ALTER TABLE "ventas_tienda" DROP COLUMN "devolucion_motivo", DROP COLUMN "vendido_por", DROP COLUMN "customer_id", DROP COLUMN "canal"`);
    // Postgres no deja sacar un valor de un enum: 'devolucion_venta' queda en
    // `wallet_movements_origen_enum` sin uso. Es inofensivo.
  }
}
