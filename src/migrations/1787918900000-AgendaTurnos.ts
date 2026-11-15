import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T6a — La agenda del taller: turnos de mostrador y de domicilio, con su
 * configuración de días, franjas y cupos.
 *
 * De paso se va `tracking_intervalo_minutos`, herencia muerta del delivery de
 * Brumm que no lee nadie. `lat`/`lng` se conservan: son el origen de la ruta.
 */
export class AgendaTurnos1787918900000 implements MigrationInterface {
  name = 'AgendaTurnos1787918900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "turnos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tipo" character varying(30) NOT NULL,
        "fecha" date NOT NULL,
        "franja" character varying(10) NOT NULL,
        "desde" TIME NOT NULL,
        "hasta" TIME NOT NULL,
        "cliente_id" uuid NOT NULL,
        "order_id" uuid,
        "equipo_id" uuid,
        "equipo_declarado" character varying(200),
        "direccion" text,
        "ciudad" character varying(80),
        "referencia_domicilio" character varying(200),
        "estado" character varying(20) NOT NULL DEFAULT 'confirmado',
        "origen" character varying(20) NOT NULL DEFAULT 'mostrador',
        "costo_visita" numeric(12,2),
        "notas" text,
        "motivo_fallo" character varying(200),
        "turno_origen_id" uuid,
        "creado_por" uuid,
        "company_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_turnos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_turnos_cliente" FOREIGN KEY ("cliente_id") REFERENCES "customers"("id"),
        CONSTRAINT "FK_turnos_orden" FOREIGN KEY ("order_id") REFERENCES "repair_orders"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_turnos_equipo" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id"),
        CONSTRAINT "FK_turnos_origen" FOREIGN KEY ("turno_origen_id") REFERENCES "turnos"("id"),
        CONSTRAINT "FK_turnos_creado_por" FOREIGN KEY ("creado_por") REFERENCES "users"("id"),
        CONSTRAINT "FK_turnos_company" FOREIGN KEY ("company_id") REFERENCES "company"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_turnos_company_fecha" ON "turnos" ("company_id", "fecha")`);
    await queryRunner.query(`CREATE INDEX "IDX_turnos_company_estado" ON "turnos" ("company_id", "estado")`);
    await queryRunner.query(`CREATE INDEX "IDX_turnos_fecha" ON "turnos" ("fecha")`);
    await queryRunner.query(`CREATE INDEX "IDX_turnos_orden" ON "turnos" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_turnos_company" ON "turnos" ("company_id")`);

    await queryRunner.query(`ALTER TABLE "company" ADD "agenda_config" jsonb`);
    await queryRunner.query(
      `ALTER TABLE "company" ADD "costo_visita_domicilio" numeric(12,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(`ALTER TABLE "company" DROP COLUMN IF EXISTS "tracking_intervalo_minutos"`);

    // Un aviso puede colgar de un turno en vez de una orden (T6a: la
    // idempotencia de agenda es por turno + tipo, no por orden).
    await queryRunner.query(`ALTER TABLE "avisos" ADD "turno_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "avisos" ADD CONSTRAINT "FK_avisos_turno" FOREIGN KEY ("turno_id") REFERENCES "turnos"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(`ALTER TABLE "avisos" ALTER COLUMN "order_id" DROP NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_avisos_turno" ON "avisos" ("turno_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_avisos_turno"`);
    await queryRunner.query(`ALTER TABLE "avisos" DROP CONSTRAINT "FK_avisos_turno"`);
    await queryRunner.query(`ALTER TABLE "avisos" DROP COLUMN "turno_id"`);

    await queryRunner.query(
      `ALTER TABLE "company" ADD "tracking_intervalo_minutos" integer NOT NULL DEFAULT '5'`,
    );
    await queryRunner.query(`ALTER TABLE "company" DROP COLUMN "costo_visita_domicilio"`);
    await queryRunner.query(`ALTER TABLE "company" DROP COLUMN "agenda_config"`);
    await queryRunner.query(`DROP TABLE "turnos"`);
  }
}
