import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Control de respaldo de compra: un repuesto con cargo al cliente no se da
 * por recibido si su orden de compra no existe o está impaga. Configurable
 * por taller (los que compran a cuenta corriente lo apagan).
 */
export class RespaldoCompraRepuestos1787916900000 implements MigrationInterface {
  name = 'RespaldoCompraRepuestos1787916900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company" ADD "exigir_oc_paga_repuestos" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "company" DROP COLUMN "exigir_oc_paga_repuestos"`);
  }
}
