import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Banners armados (spec 2026-10-08 banners armados): la tienda dibuja el
 * banner con texto real. Los existentes quedan `imagen` (el default), fondo
 * `tinta`. El repuesto es opcional y, si se borra, el banner queda sin él.
 */
export class BannersArmados1789800000013 implements MigrationInterface {
  name = 'BannersArmados1789800000013';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "banners_tienda"
        ADD COLUMN "modo" character varying(10) NOT NULL DEFAULT 'imagen',
        ADD COLUMN "boton_texto" character varying(40),
        ADD COLUMN "fondo" character varying(10) NOT NULL DEFAULT 'tinta',
        ADD COLUMN "producto_id" uuid`);
    await q.query(`
      ALTER TABLE "banners_tienda"
        ADD CONSTRAINT "FK_banners_tienda_producto" FOREIGN KEY ("producto_id") REFERENCES "ingredients"("id") ON DELETE SET NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "banners_tienda" DROP CONSTRAINT "FK_banners_tienda_producto"`);
    await q.query(`
      ALTER TABLE "banners_tienda"
        DROP COLUMN "producto_id",
        DROP COLUMN "fondo",
        DROP COLUMN "boton_texto",
        DROP COLUMN "modo"`);
  }
}
