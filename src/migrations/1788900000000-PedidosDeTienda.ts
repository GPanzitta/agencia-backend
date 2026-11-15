import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pedidos de repuesto que entran por la tienda — T1b (09/09/2026).
 *
 * La demanda que la vidriera genera y que hasta ahora se perdía en el chat de
 * WhatsApp: quién pidió qué pieza, quién quiere que le avisen cuando llegue y
 * quién no sabe cuál necesita.
 *
 * Tabla propia y no `customers`: la mayoría de estos pedidos no termina en
 * nada, y el que sí termina se convierte en cliente por el camino de siempre.
 */
export class PedidosDeTienda1788900000000 implements MigrationInterface {
  name = 'PedidosDeTienda1788900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "pedidos_tienda" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tipo" character varying(10) NOT NULL,
        "estado" character varying(12) NOT NULL DEFAULT 'nuevo',
        "ingredient_id" uuid,
        "descripcion" text,
        "equipo_marca" character varying(80),
        "equipo_modelo" character varying(120),
        "nombre" character varying(120) NOT NULL,
        "telefono" character varying(40) NOT NULL,
        "email" character varying(120),
        "mensaje" text,
        "origen" character varying(160),
        "nota_interna" text,
        "atendido_por" uuid,
        "atendido_en" TIMESTAMP WITH TIME ZONE,
        "company_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pedidos_tienda" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pedidos_tienda_repuesto" FOREIGN KEY ("ingredient_id")
          REFERENCES "ingredients"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_pedidos_tienda_usuario" FOREIGN KEY ("atendido_por")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_pedidos_tienda_empresa" FOREIGN KEY ("company_id")
          REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_pedidos_tienda_empresa" ON "pedidos_tienda" ("company_id")`);
    // La bandeja del mostrador entra siempre por estado.
    await q.query(
      `CREATE INDEX "IDX_pedidos_tienda_estado" ON "pedidos_tienda" ("company_id", "estado")`,
    );
    // Y la sugerencia de compra, por repuesto.
    await q.query(
      `CREATE INDEX "IDX_pedidos_tienda_repuesto" ON "pedidos_tienda" ("company_id", "ingredient_id")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_pedidos_tienda_repuesto"`);
    await q.query(`DROP INDEX "IDX_pedidos_tienda_estado"`);
    await q.query(`DROP INDEX "IDX_pedidos_tienda_empresa"`);
    await q.query(`DROP TABLE "pedidos_tienda"`);
  }
}
