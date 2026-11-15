import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Notas técnicas (spec 2026-09-07): la memoria escrita del taller. Tabla
 * nueva, sin backfill: no existe dato previo que migrar.
 */
export class NotasTecnicas1788400000000 implements MigrationInterface {
  name = 'NotasTecnicas1788400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "notas_tecnicas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "modelo" character varying(120) NOT NULL,
        "modelo_busqueda" character varying(140) NOT NULL,
        "marca" character varying(80),
        "rubro_id" uuid,
        "problema" character varying(300) NOT NULL,
        "resolucion" text NOT NULL,
        "fotos" jsonb NOT NULL DEFAULT '[]',
        "autor_id" uuid NOT NULL,
        "company_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notas_tecnicas" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notas_tecnicas_rubro" FOREIGN KEY ("rubro_id") REFERENCES "tipos_equipo"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_notas_tecnicas_autor" FOREIGN KEY ("autor_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_notas_tecnicas_company" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_notas_tecnicas_company_modelo" ON "notas_tecnicas" ("company_id", "modelo_busqueda")`);
    await q.query(`CREATE INDEX "IDX_notas_tecnicas_company" ON "notas_tecnicas" ("company_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_notas_tecnicas_company"`);
    await q.query(`DROP INDEX "IDX_notas_tecnicas_company_modelo"`);
    await q.query(`DROP TABLE "notas_tecnicas"`);
  }
}
