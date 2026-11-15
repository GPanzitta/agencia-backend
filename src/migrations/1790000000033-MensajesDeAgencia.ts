import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agencia (14/11/2026): mensajes al cliente por WhatsApp y correo. Las
 * plantillas usan la tabla que ya existía (`mensaje_plantillas`); acá se suma
 * el registro de lo que se le escribió a cada interesado o comprador.
 *
 * Riesgo: ninguno. Una tabla nueva y el valor por defecto de una columna.
 */
export class MensajesDeAgencia1790000000033 implements MigrationInterface {
  name = 'MensajesDeAgencia1790000000033';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "mensaje_plantillas" ALTER COLUMN "contexto" SET DEFAULT 'interesado'`);
    await q.query(`CREATE TABLE IF NOT EXISTS "mensajes_enviados" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "canal" varchar(10) NOT NULL,
      "interesado_id" uuid,
      "operacion_id" uuid,
      "para" varchar(200) NOT NULL,
      "asunto" varchar(200),
      "cuerpo" text NOT NULL,
      "plantilla" varchar(80),
      "estado" varchar(10) NOT NULL,
      "error" varchar(300),
      "autor" varchar(120),
      "company_id" uuid,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_mensajes_enviados_interesado" ON "mensajes_enviados" ("interesado_id")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_mensajes_enviados_operacion" ON "mensajes_enviados" ("operacion_id")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_mensajes_enviados_empresa" ON "mensajes_enviados" ("company_id", "created_at")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "mensaje_plantillas" ALTER COLUMN "contexto" SET DEFAULT 'orden'`);
    await q.dropTable('mensajes_enviados', true);
  }
}
