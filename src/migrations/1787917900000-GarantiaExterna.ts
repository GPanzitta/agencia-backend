import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Garantía de terceros: además del reingreso por garantía propia, una orden
 * puede entrar cubierta por la marca, la cadena que vendió el equipo o una
 * aseguradora, que llevan el caso con su propio número en su sistema.
 */
export class GarantiaExterna1787917900000 implements MigrationInterface {
  name = 'GarantiaExterna1787917900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "repair_orders" ADD "garantia_empresa" character varying(120)`,
    );
    await queryRunner.query(
      `ALTER TABLE "repair_orders" ADD "garantia_orden_externa" character varying(60)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "repair_orders" DROP COLUMN "garantia_orden_externa"`);
    await queryRunner.query(`ALTER TABLE "repair_orders" DROP COLUMN "garantia_empresa"`);
  }
}
