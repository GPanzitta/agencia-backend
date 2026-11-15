import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Atributos por categoría para los filtros de la tienda (rediseño del listado,
 * 16/10/2026).
 *
 * - `categorias_repuesto.atributos`: las características que la categoría le
 *   pide a sus repuestos (`[{clave, nombre, opciones}]`). Las subcategorías
 *   heredan las del rubro.
 * - `ingredients.atributos`: los valores de cada repuesto (`{clave: valor}`).
 *   El índice GIN es para el filtro `atributos @> '{"clave":"valor"}'` del
 *   listado público.
 *
 * Riesgo: bajo. Columnas nuevas con default constante (Postgres 11+ no
 * reescribe la tabla) e índice con `IF NOT EXISTS`: se puede correr dos veces.
 */
export class AtributosDeTienda1790000000010 implements MigrationInterface {
  name = 'AtributosDeTienda1790000000010';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "categorias_repuesto" ADD COLUMN IF NOT EXISTS "atributos" jsonb NOT NULL DEFAULT '[]'`);
    await q.query(`ALTER TABLE "ingredients" ADD COLUMN IF NOT EXISTS "atributos" jsonb NOT NULL DEFAULT '{}'`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_ingredients_atributos" ON "ingredients" USING GIN ("atributos" jsonb_path_ops)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_ingredients_atributos"`);
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN IF EXISTS "atributos"`);
    await q.query(`ALTER TABLE "categorias_repuesto" DROP COLUMN IF EXISTS "atributos"`);
  }
}
