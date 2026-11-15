import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Perfil público del taller (S1a, 18/09/2026): lo que la home del comercio
 * muestra de cada taller. Una fila por empresa, creada al primer guardado
 * desde Configuración → Sitio web. Los defaults viven acá y en
 * `perfilPorDefecto()`; tienen que coincidir.
 */
export class PerfilPublico1789500000000 implements MigrationInterface {
  name = 'PerfilPublico1789500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "perfil_publico" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "eslogan" character varying(120),
        "quienes_somos" text,
        "zona" character varying(160),
        "color_acento" character varying(16) NOT NULL DEFAULT 'amarillo',
        "logo_url" text,
        "portada_url" text,
        "foto_equipo_url" text,
        "horarios" jsonb NOT NULL DEFAULT '[]',
        "redes" jsonb NOT NULL DEFAULT '{}',
        "marcas" text array NOT NULL DEFAULT '{}',
        "servicios" jsonb NOT NULL DEFAULT '[]',
        "fotos_trabajos" jsonb NOT NULL DEFAULT '[]',
        "cifras" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_perfil_publico" PRIMARY KEY ("id"),
        CONSTRAINT "FK_perfil_publico_company" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "IDX_perfil_publico_company" ON "perfil_publico" ("company_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "perfil_publico"`);
  }
}
