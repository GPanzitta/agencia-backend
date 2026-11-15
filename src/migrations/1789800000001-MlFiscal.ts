import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Atributos fiscales de Mercado Libre por taller (21/09/2026): IVA, derechos
 * de importación y motivo de "sin código de barras". ML los exige en toda
 * alta de producto nuevo (transparencia fiscal); antes no se mandaban y el
 * alta fallaba con "The attributes [GTIN,VALUE_ADDED_TAX,IMPORT_DUTY] are required".
 */
export class MlFiscal1789800000001 implements MigrationInterface {
  name = 'MlFiscal1789800000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "conexiones_ml" ADD "iva" character varying(12) NOT NULL DEFAULT '21 %'`);
    await q.query(`ALTER TABLE "conexiones_ml" ADD "derechos_importacion" character varying(12) NOT NULL DEFAULT '0 %'`);
    await q.query(`ALTER TABLE "conexiones_ml" ADD "sin_gtin_motivo" character varying(60) NOT NULL DEFAULT 'El producto no tiene código registrado'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "conexiones_ml" DROP COLUMN "sin_gtin_motivo"`);
    await q.query(`ALTER TABLE "conexiones_ml" DROP COLUMN "derechos_importacion"`);
    await q.query(`ALTER TABLE "conexiones_ml" DROP COLUMN "iva"`);
  }
}
