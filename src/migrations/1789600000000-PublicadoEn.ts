import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `ingredients.publicado_en` (S1c-a, 19/09/2026): cuándo se publicó cada
 * repuesto en la tienda, para que el portal liste primero lo último. Los que
 * ya estaban publicados reciben `now()`: empatan entre sí y se desempatan
 * por nombre, que es lo que hacía el listado hasta hoy.
 */
export class PublicadoEn1789600000000 implements MigrationInterface {
  name = 'PublicadoEn1789600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ingredients" ADD "publicado_en" TIMESTAMP WITH TIME ZONE`);
    await q.query(`UPDATE "ingredients" SET "publicado_en" = now() WHERE "publicado" = true`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN "publicado_en"`);
  }
}
