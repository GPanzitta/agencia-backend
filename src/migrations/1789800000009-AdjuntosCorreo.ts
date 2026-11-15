import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Correos con adjuntos (spec 2026-10-07 §3): los PDF subidos a la orden, la
 * lista de adjuntos de cada correo registrado y los documentos que cada
 * plantilla tilda sola. Relleno: la plantilla del sistema `email_presupuesto`
 * sugiere el presupuesto.
 */
export class AdjuntosCorreo1789800000009 implements MigrationInterface {
  name = 'AdjuntosCorreo1789800000009';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "orden_documentos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "nombre" character varying(160) NOT NULL,
        "url" text NOT NULL,
        "peso" integer NOT NULL,
        "subido_por_id" uuid,
        "subido_por_nombre" character varying(120),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orden_documentos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_orden_documentos_orden" FOREIGN KEY ("order_id") REFERENCES "repair_orders"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX "IDX_orden_documentos_orden_fecha" ON "orden_documentos" ("order_id", "created_at")`);

    await q.query(`ALTER TABLE "correos_enviados" ADD "adjuntos" jsonb NOT NULL DEFAULT '[]'`);

    await q.query(`ALTER TABLE "mensaje_plantillas" ADD "adjuntos_sugeridos" text array NOT NULL DEFAULT '{}'`);
    await q.query(`UPDATE "mensaje_plantillas" SET "adjuntos_sugeridos" = '{presupuesto}' WHERE "clave" = 'email_presupuesto'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "mensaje_plantillas" DROP COLUMN "adjuntos_sugeridos"`);
    await q.query(`ALTER TABLE "correos_enviados" DROP COLUMN "adjuntos"`);
    await q.query(`DROP TABLE "orden_documentos"`);
  }
}
