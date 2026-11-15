import { MigrationInterface, QueryRunner } from 'typeorm';

import { plantillasPorDefecto } from '../mensajes/plantillas-defaults';

/**
 * Mensajes de WhatsApp editables por taller.
 *
 * Siembra las 15 plantillas del sistema para cada empresa existente con el
 * texto que hoy está hardcodeado: el resultado del sistema no cambia el día
 * que esto corre, y a partir de ahí el taller puede tocarlas.
 *
 * El listado se importa del util (una sola fuente de verdad de los textos)
 * pero se inserta con SQL parametrizado, no con el repositorio: una migración
 * que depende de la metadata de las entidades deja de correr en cuanto la
 * entidad cambia.
 */
export class MensajesPlantillas1788100000000 implements MigrationInterface {
  name = 'MensajesPlantillas1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "mensaje_plantillas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid,
        "clave" character varying(40),
        "nombre" character varying(80) NOT NULL,
        "texto" text NOT NULL,
        "contexto" character varying(10) NOT NULL DEFAULT 'orden',
        "activa" boolean NOT NULL DEFAULT true,
        "orden_visual" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mensaje_plantillas" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mensaje_plantillas_company" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_mensaje_plantillas_company" ON "mensaje_plantillas" ("company_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_mensaje_plantillas_selector" ON "mensaje_plantillas" ("company_id", "contexto", "activa")`,
    );
    // Parcial: dos plantillas propias del taller pueden tener `clave` nula, y
    // en Postgres los NULL no chocan entre sí igual, pero el índice parcial
    // deja explícito que la unicidad es solo sobre las del sistema.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_mensaje_plantillas_company_clave" ON "mensaje_plantillas" ("company_id", "clave") WHERE "clave" IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TYPE "audit_logs_accion_enum" ADD VALUE IF NOT EXISTS 'plantilla_editada'`,
    );

    const companies: { id: string }[] = await queryRunner.query(`SELECT id FROM "company"`);
    const defaults = plantillasPorDefecto();
    for (const c of companies) {
      for (let i = 0; i < defaults.length; i++) {
        const p = defaults[i];
        await queryRunner.query(
          `INSERT INTO "mensaje_plantillas" ("company_id", "clave", "nombre", "texto", "contexto", "orden_visual")
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [c.id, p.clave, p.nombre, p.texto, p.contexto, i],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "mensaje_plantillas"`);
    // El valor del enum de PG no se quita sin recrear el tipo; queda inofensivo.
  }
}
