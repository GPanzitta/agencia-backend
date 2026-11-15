import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D2 (tanda 3b, 26/09/2026): en la puerta el chofer cobra en efectivo, por
 * transferencia o por Mercado Pago, y cada medio entra a su billetera. El
 * efectivo sigue yendo a la caja de la ruta; MP, a `company.mp_wallet_id`; la
 * transferencia, a la billetera nueva `company.transferencia_wallet_id`.
 *
 * `ruta_paradas.cobrado_wallet_id` deja escrito a qué billetera fue cada cobro,
 * así la rendición cuenta sólo el efectivo y la OS dice dónde está la plata.
 */
export class CobroPorMedio1789800000006 implements MigrationInterface {
  name = 'CobroPorMedio1789800000006';

  public async up(q: QueryRunner): Promise<void> {
    // D2: billetera de las transferencias que el chofer cobra en la puerta.
    // Sin FK, igual que mp_wallet_id (Sub5Cierre).
    await q.query(`ALTER TABLE "company" ADD "transferencia_wallet_id" uuid`);
    await q.query(`ALTER TABLE "ruta_paradas" ADD "cobrado_wallet_id" uuid`);
    // Antes de D2 todo cobro en la puerta entraba a la billetera de la ruta
    // (rutas.service.ts, ramas entregado y resuelto), y rutas.wallet_id sólo se
    // escribe al crear la ruta. Idempotente: se puede volver a correr.
    await q.query(`UPDATE "ruta_paradas" p SET "cobrado_wallet_id" = r."wallet_id"
                     FROM "rutas" r
                    WHERE r."id" = p."ruta_id" AND p."cobrado_monto" > 0
                      AND r."wallet_id" IS NOT NULL AND p."cobrado_wallet_id" IS NULL`);
    await q.query(`ALTER TABLE "ruta_paradas" ADD CONSTRAINT "FK_ruta_paradas_cobrado_wallet"
                     FOREIGN KEY ("cobrado_wallet_id") REFERENCES "wallets"("id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ruta_paradas" DROP CONSTRAINT "FK_ruta_paradas_cobrado_wallet"`);
    await q.query(`ALTER TABLE "ruta_paradas" DROP COLUMN "cobrado_wallet_id"`);
    await q.query(`ALTER TABLE "company" DROP COLUMN "transferencia_wallet_id"`);
  }
}
