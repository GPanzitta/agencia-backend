import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Correos personalizados a clientes (16/09/2026): las plantillas ganan canal
 * (whatsapp / email) y asunto, y cada correo mandado desde el ERP queda en
 * `correos_enviados` (enviado o fallido, con el error). Las tres plantillas
 * de correo por defecto se siembran desde código (`sembrarPlantillas`, que
 * ya corre por empresa al listar/crear), no acá.
 */
export class Correos1789400000000 implements MigrationInterface {
  name = 'Correos1789400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "mensaje_plantillas" ADD "canal" character varying(10) NOT NULL DEFAULT 'whatsapp'`);
    await q.query(`ALTER TABLE "mensaje_plantillas" ADD "asunto" character varying(150)`);
    await q.query(`
      CREATE TABLE "correos_enviados" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid,
        "cliente_id" uuid NOT NULL,
        "orden_id" uuid,
        "plantilla_id" uuid,
        "para" character varying(160) NOT NULL,
        "asunto" character varying(200) NOT NULL,
        "cuerpo" text NOT NULL,
        "estado" character varying(10) NOT NULL DEFAULT 'enviado',
        "error" text,
        "enviado_por_id" uuid,
        "enviado_por_nombre" character varying(120),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_correos_enviados" PRIMARY KEY ("id")
      )
    `);
    await q.query(`CREATE INDEX "IDX_correos_enviados_company" ON "correos_enviados" ("company_id")`);
    await q.query(`CREATE INDEX "IDX_correos_enviados_cliente" ON "correos_enviados" ("cliente_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "correos_enviados"`);
    await q.query(`ALTER TABLE "mensaje_plantillas" DROP COLUMN "asunto"`);
    await q.query(`ALTER TABLE "mensaje_plantillas" DROP COLUMN "canal"`);
  }
}
