import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tienda de repuestos — T2 (09/09/2026): el carrito y la venta que cobra.
 *
 * El carrito vive en la base y no en el navegador: lo que el cliente carga
 * tiene que tener respaldo. La venta congela sus renglones (descripción,
 * código, cantidad y precio) porque un comprobante no puede cambiar cuando
 * cambia el catálogo.
 *
 * Montos guardados, no recalculados: `subtotal`, `costo_envio` y `total` son
 * columnas, no cálculos. La venta pública se referencia por `token`, nunca
 * por id.
 */
export class TiendaVentas1789000000000 implements MigrationInterface {
  name = 'TiendaVentas1789000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "carritos_tienda" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "token" uuid NOT NULL,
        "venta_id" uuid,
        "company_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_carritos_tienda" PRIMARY KEY ("id"),
        CONSTRAINT "FK_carritos_tienda_empresa" FOREIGN KEY ("company_id")
          REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_carritos_tienda_token" ON "carritos_tienda" ("token")`,
    );
    await q.query(
      `CREATE INDEX "IDX_carritos_tienda_empresa" ON "carritos_tienda" ("company_id")`,
    );

    await q.query(`
      CREATE TABLE "carrito_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "carrito_id" uuid NOT NULL,
        "ingredient_id" uuid NOT NULL,
        "cantidad" numeric(12,3) NOT NULL DEFAULT 1,
        "precio_visto" numeric(12,2) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_carrito_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_carrito_items_carrito" FOREIGN KEY ("carrito_id")
          REFERENCES "carritos_tienda"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_carrito_items_repuesto" FOREIGN KEY ("ingredient_id")
          REFERENCES "ingredients"("id") ON DELETE CASCADE
      )
    `);
    // Único compuesto: agregar de nuevo el mismo repuesto suma cantidad en vez
    // de duplicar el renglón.
    await q.query(`
      CREATE UNIQUE INDEX "UQ_carrito_items_carrito_repuesto"
        ON "carrito_items" ("carrito_id", "ingredient_id")
    `);

    await q.query(`
      CREATE TABLE "ventas_tienda" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "numero" character varying(20) NOT NULL,
        "token" uuid NOT NULL,
        "estado" character varying(16) NOT NULL DEFAULT 'pendiente_pago',
        "nombre" character varying(120) NOT NULL,
        "telefono" character varying(40) NOT NULL,
        "email" character varying(120),
        "modo_entrega" character varying(8) NOT NULL DEFAULT 'retiro',
        "direccion" character varying(200),
        "ciudad" character varying(120),
        "cp" character varying(20),
        "notas_entrega" text,
        "subtotal" numeric(12,2) NOT NULL DEFAULT 0,
        "costo_envio" numeric(12,2) NOT NULL DEFAULT 0,
        "total" numeric(12,2) NOT NULL DEFAULT 0,
        "medio_pago" character varying(16) NOT NULL,
        "mp_payment_id" character varying(60),
        "pagado_at" TIMESTAMP WITH TIME ZONE,
        "wallet_id" uuid,
        "reserva_vence_at" TIMESTAMP WITH TIME ZONE,
        "carrito_id" uuid,
        "despachado_at" TIMESTAMP WITH TIME ZONE,
        "entregado_at" TIMESTAMP WITH TIME ZONE,
        "entregado_por" uuid,
        "cancelado_motivo" text,
        "nota_interna" text,
        "company_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ventas_tienda" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ventas_tienda_entregado_por" FOREIGN KEY ("entregado_por")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_ventas_tienda_empresa" FOREIGN KEY ("company_id")
          REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_ventas_tienda_numero" ON "ventas_tienda" ("numero")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_ventas_tienda_token" ON "ventas_tienda" ("token")`,
    );
    // La bandeja del mostrador entra siempre por estado.
    await q.query(
      `CREATE INDEX "IDX_ventas_tienda_empresa_estado" ON "ventas_tienda" ("company_id", "estado")`,
    );
    await q.query(
      `CREATE INDEX "IDX_ventas_tienda_empresa" ON "ventas_tienda" ("company_id")`,
    );

    await q.query(`
      CREATE TABLE "ventas_tienda_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "venta_id" uuid NOT NULL,
        "ingredient_id" uuid,
        "descripcion" character varying(200) NOT NULL,
        "codigo" character varying(80),
        "cantidad" numeric(12,3) NOT NULL,
        "precio_unitario" numeric(12,2) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ventas_tienda_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ventas_tienda_items_venta" FOREIGN KEY ("venta_id")
          REFERENCES "ventas_tienda"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ventas_tienda_items_repuesto" FOREIGN KEY ("ingredient_id")
          REFERENCES "ingredients"("id") ON DELETE SET NULL
      )
    `);

    await q.query(`
      ALTER TABLE "company"
        ADD COLUMN "envio_habilitado" boolean NOT NULL DEFAULT false,
        ADD COLUMN "costo_envio_tienda" numeric(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN "reserva_horas" integer NOT NULL DEFAULT 24
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "company"
        DROP COLUMN "reserva_horas",
        DROP COLUMN "costo_envio_tienda",
        DROP COLUMN "envio_habilitado"
    `);

    await q.query(`DROP TABLE "ventas_tienda_items"`);

    await q.query(`DROP INDEX "IDX_ventas_tienda_empresa"`);
    await q.query(`DROP INDEX "IDX_ventas_tienda_empresa_estado"`);
    await q.query(`DROP INDEX "UQ_ventas_tienda_token"`);
    await q.query(`DROP INDEX "UQ_ventas_tienda_numero"`);
    await q.query(`DROP TABLE "ventas_tienda"`);

    await q.query(`DROP INDEX "UQ_carrito_items_carrito_repuesto"`);
    await q.query(`DROP TABLE "carrito_items"`);

    await q.query(`DROP INDEX "IDX_carritos_tienda_empresa"`);
    await q.query(`DROP INDEX "UQ_carritos_tienda_token"`);
    await q.query(`DROP TABLE "carritos_tienda"`);
  }
}
