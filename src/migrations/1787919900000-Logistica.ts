import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T6b — La hoja de ruta: qué paradas hace el chofer, en qué orden, y con qué
 * billetera vuelve a rendir.
 */
export class Logistica1787919900000 implements MigrationInterface {
  name = 'Logistica1787919900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rutas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "fecha" date NOT NULL,
        "chofer_id" uuid NOT NULL,
        "estado" character varying(20) NOT NULL DEFAULT 'planificada',
        "wallet_id" uuid,
        "iniciada_at" TIMESTAMP WITH TIME ZONE,
        "cerrada_at" TIMESTAMP WITH TIME ZONE,
        "rendido" numeric(12,2),
        "company_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_rutas" PRIMARY KEY ("id"),
        CONSTRAINT "FK_rutas_chofer" FOREIGN KEY ("chofer_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_rutas_wallet" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id"),
        CONSTRAINT "FK_rutas_company" FOREIGN KEY ("company_id") REFERENCES "company"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_rutas_company_fecha" ON "rutas" ("company_id", "fecha")`);
    await queryRunner.query(`CREATE INDEX "IDX_rutas_fecha" ON "rutas" ("fecha")`);
    await queryRunner.query(`CREATE INDEX "IDX_rutas_chofer" ON "rutas" ("chofer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_rutas_company" ON "rutas" ("company_id")`);

    await queryRunner.query(`
      CREATE TABLE "ruta_paradas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "ruta_id" uuid NOT NULL,
        "turno_id" uuid NOT NULL,
        "orden_visita" integer NOT NULL DEFAULT 1,
        "hora_marcada" TIMESTAMP WITH TIME ZONE,
        "cobrado_monto" numeric(12,2),
        "cobrado_medio" character varying(40),
        "marcada_por" uuid,
        CONSTRAINT "PK_ruta_paradas" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ruta_paradas_turno" UNIQUE ("turno_id"),
        CONSTRAINT "FK_ruta_paradas_ruta" FOREIGN KEY ("ruta_id") REFERENCES "rutas"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ruta_paradas_turno" FOREIGN KEY ("turno_id") REFERENCES "turnos"("id"),
        CONSTRAINT "FK_ruta_paradas_user" FOREIGN KEY ("marcada_por") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ruta_paradas_ruta" ON "ruta_paradas" ("ruta_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ruta_paradas"`);
    await queryRunner.query(`DROP TABLE "rutas"`);
  }
}
