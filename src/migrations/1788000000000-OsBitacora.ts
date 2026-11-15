import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bitácora de la OS: comentarios por orden, separados de la telemetría.
 * Suma dos acciones de auditoría: la edición de datos de la orden y la
 * edición de un comentario (el texto anterior queda solo en el log).
 */
export class OsBitacora1788000000000 implements MigrationInterface {
  name = 'OsBitacora1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "repair_order_notes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "company_id" uuid,
        "autor_id" uuid,
        "autor_nombre" character varying(120) NOT NULL,
        "autor_rol" character varying(20) NOT NULL,
        "texto" text NOT NULL,
        "visible_cliente" boolean NOT NULL DEFAULT false,
        "origen" character varying(20) NOT NULL DEFAULT 'manual',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE,
        "editado_por_id" uuid,
        CONSTRAINT "PK_repair_order_notes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_repair_order_notes_order" FOREIGN KEY ("order_id") REFERENCES "repair_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_repair_order_notes_company" FOREIGN KEY ("company_id") REFERENCES "company"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_repair_order_notes_order" ON "repair_order_notes" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_repair_order_notes_company" ON "repair_order_notes" ("company_id")`);
    await queryRunner.query(`ALTER TYPE "audit_logs_accion_enum" ADD VALUE IF NOT EXISTS 'orden_editada'`);
    await queryRunner.query(`ALTER TYPE "audit_logs_accion_enum" ADD VALUE IF NOT EXISTS 'bitacora_editada'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "repair_order_notes"`);
    // Los valores del enum PG no se quitan sin recrear el tipo; quedan inofensivos.
  }
}
