import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T5 — Comunicación: bandeja de avisos al cliente y encuesta post-entrega.
 */
export class Comunicacion1787915900000 implements MigrationInterface {
  name = 'Comunicacion1787915900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "avisos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tipo" character varying(30) NOT NULL,
        "estado" character varying(20) NOT NULL DEFAULT 'pendiente',
        "order_id" uuid NOT NULL,
        "motivo" character varying(120) NOT NULL,
        "texto" text NOT NULL,
        "enviado_at" TIMESTAMP WITH TIME ZONE,
        "enviado_por" uuid,
        "company_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_avisos" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `ALTER TABLE "avisos" ADD CONSTRAINT "FK_avisos_orden"
       FOREIGN KEY ("order_id") REFERENCES "repair_orders"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "avisos" ADD CONSTRAINT "FK_avisos_usuario"
       FOREIGN KEY ("enviado_por") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "avisos" ADD CONSTRAINT "FK_avisos_company"
       FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_avisos_estado" ON "avisos" ("estado")`);
    await queryRunner.query(`CREATE INDEX "IDX_avisos_company_estado" ON "avisos" ("company_id", "estado")`);
    await queryRunner.query(`CREATE INDEX "IDX_avisos_orden_tipo" ON "avisos" ("order_id", "tipo")`);

    // Encuesta post-entrega: la responde el cliente desde el portal.
    await queryRunner.query(`ALTER TABLE "repair_orders" ADD "nps_puntaje" integer`);
    await queryRunner.query(`ALTER TABLE "repair_orders" ADD "nps_comentario" text`);
    await queryRunner.query(
      `ALTER TABLE "repair_orders" ADD "nps_respondido_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "repair_orders" DROP COLUMN "nps_respondido_at"`);
    await queryRunner.query(`ALTER TABLE "repair_orders" DROP COLUMN "nps_comentario"`);
    await queryRunner.query(`ALTER TABLE "repair_orders" DROP COLUMN "nps_puntaje"`);
    await queryRunner.query(`DROP TABLE "avisos"`);
  }
}
