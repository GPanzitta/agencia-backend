import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El tipo de pieza (spec 2026-09-23 §6.3): `varchar(40)` y no un enum de
 * Postgres, para sumar tipos sin migración; la lista vive en
 * src/ingredientes/tipo-pieza.util.ts. Nullable porque el catálogo entero
 * arranca sin tipo: el despiece se enciende de a una pieza (§4.3).
 */
export class TipoPieza1789800000005 implements MigrationInterface {
  name = 'TipoPieza1789800000005';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ingredients" ADD "tipo_pieza" character varying(40)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN "tipo_pieza"`);
  }
}
