import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * «Vende repuestos»: un interruptor del taller en el perfil público. Apagado,
 * el sitio esconde lo que sirve para buscar piezas, sin borrar nada. Riesgo:
 * ninguno; una columna con default `true`, que es como funciona hoy.
 */
export class VendeRepuestos1790000000018 implements MigrationInterface {
  name = 'VendeRepuestos1790000000018';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "perfil_publico" ADD COLUMN IF NOT EXISTS "vende_repuestos" boolean NOT NULL DEFAULT true`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "perfil_publico" DROP COLUMN IF EXISTS "vende_repuestos"`);
  }
}
