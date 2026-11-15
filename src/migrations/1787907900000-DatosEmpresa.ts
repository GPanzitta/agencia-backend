import { MigrationInterface, QueryRunner } from 'typeorm';

/** Membrete de la documentación física: teléfono y CUIT del taller. */
export class DatosEmpresa1787907900000 implements MigrationInterface {
  name = 'DatosEmpresa1787907900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "company" ADD "telefono" character varying(40)`);
    await queryRunner.query(`ALTER TABLE "company" ADD "cuit" character varying(20)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "company" DROP COLUMN "cuit"`);
    await queryRunner.query(`ALTER TABLE "company" DROP COLUMN "telefono"`);
  }
}
