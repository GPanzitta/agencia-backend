import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T3 — Recepción robusta: trazabilidad física del equipo desde el ingreso.
 * Estado estético (respaldo ante reclamos), fotos de recepción y ubicación
 * en el taller.
 */
export class RecepcionRobusta1787913900000 implements MigrationInterface {
  name = 'RecepcionRobusta1787913900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "repair_orders" ADD "estado_estetico" character varying(200)`,
    );
    await queryRunner.query(
      `ALTER TABLE "repair_orders" ADD "fotos_recepcion" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "repair_orders" ADD "ubicacion" character varying(40)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "repair_orders" DROP COLUMN "ubicacion"`);
    await queryRunner.query(`ALTER TABLE "repair_orders" DROP COLUMN "fotos_recepcion"`);
    await queryRunner.query(`ALTER TABLE "repair_orders" DROP COLUMN "estado_estetico"`);
  }
}
