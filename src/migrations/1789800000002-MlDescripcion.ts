import { MigrationInterface, QueryRunner } from 'typeorm';

/** Texto del taller al pie de cada publicación de Mercado Libre (21/09/2026). */
export class MlDescripcion1789800000002 implements MigrationInterface {
  name = 'MlDescripcion1789800000002';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "conexiones_ml" ADD "descripcion_ml" text`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "conexiones_ml" DROP COLUMN "descripcion_ml"`);
  }
}
