import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T7a — Rubro de equipo, objetivos de SLA y topes de carga.
 *
 * Los rubros se siembran con los diez habituales de un service de línea
 * blanca. Los equipos existentes se clasifican SOLO por coincidencia exacta
 * del texto: adivinar por la primera palabra equivocaría casos sin que nadie
 * se enterara, y un informe prolijo y falso es peor que uno con un agujero
 * a la vista.
 *
 * La comparación va sin `unaccent`: la extensión no está instalada en la BD
 * gestionada y no se instala desde acá. De los diez rubros sembrados el único
 * con acento es "Pequeños electrodomésticos", que no matchea ningún texto
 * libre existente de todas formas.
 */
export class Analitica1787920900000 implements MigrationInterface {
  name = 'Analitica1787920900000';

  private readonly RUBROS = [
    'Lavarropas', 'Secarropas', 'Lavavajillas', 'Heladera', 'Freezer',
    'Cocina', 'Microondas', 'Televisor', 'Aire acondicionado',
    'Pequeños electrodomésticos',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tipos_equipo" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "nombre" character varying(60) NOT NULL,
        "activo" boolean NOT NULL DEFAULT true,
        "company_id" uuid,
        CONSTRAINT "PK_tipos_equipo" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tipos_equipo_company" FOREIGN KEY ("company_id") REFERENCES "company"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_tipos_equipo_company_activo" ON "tipos_equipo" ("company_id", "activo")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_tipos_equipo_company" ON "tipos_equipo" ("company_id")`);

    await queryRunner.query(`ALTER TABLE "equipos" ADD "rubro_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "equipos" ADD CONSTRAINT "FK_equipos_rubro" FOREIGN KEY ("rubro_id") REFERENCES "tipos_equipo"("id")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_equipos_rubro" ON "equipos" ("rubro_id")`);

    // Un juego de rubros por empresa existente.
    const companies = await queryRunner.query(`SELECT id FROM "company"`);
    for (const c of companies as { id: string }[]) {
      for (const nombre of this.RUBROS) {
        await queryRunner.query(
          `INSERT INTO "tipos_equipo" ("nombre", "company_id") VALUES ($1, $2)`,
          [nombre, c.id],
        );
      }
    }

    // Clasificación conservadora: solo coincidencia exacta, sin mayúsculas.
    // Lo que no matchea queda en null a propósito.
    await queryRunner.query(`
      UPDATE "equipos" e
      SET "rubro_id" = t."id"
      FROM "tipos_equipo" t
      WHERE t."company_id" = e."company_id"
        AND lower(trim(e."tipo")) = lower(t."nombre")
    `);

    await queryRunner.query(`ALTER TABLE "company" ADD "sla_config" jsonb`);
    await queryRunner.query(
      `ALTER TABLE "company" ADD "tope_ordenes_tecnico" integer NOT NULL DEFAULT 8`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "tope_ordenes" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "tope_ordenes"`);
    await queryRunner.query(`ALTER TABLE "company" DROP COLUMN "tope_ordenes_tecnico"`);
    await queryRunner.query(`ALTER TABLE "company" DROP COLUMN "sla_config"`);
    await queryRunner.query(`ALTER TABLE "equipos" DROP CONSTRAINT "FK_equipos_rubro"`);
    await queryRunner.query(`ALTER TABLE "equipos" DROP COLUMN "rubro_id"`);
    await queryRunner.query(`DROP TABLE "tipos_equipo"`);
  }
}
