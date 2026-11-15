import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ficha de cliente de taller: documento (DNI/CUIT — la liquidación B2B y la
 * factura lo piden) y un teléfono alternativo (el "si no atiendo, llamá a…").
 */
export class ClientesTaller1787910900000 implements MigrationInterface {
  name = 'ClientesTaller1787910900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customers" ADD "documento" character varying(20)`);
    await queryRunner.query(`ALTER TABLE "customers" ADD "telefono_alternativo" character varying(20)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "telefono_alternativo"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "documento"`);
  }
}
