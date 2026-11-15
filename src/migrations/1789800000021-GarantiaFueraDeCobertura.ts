import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fuera de garantía de marca (13/10/2026). Pedido del dueño: «En el caso de
 * que esté FG porque no sé, estaba mojado el electrodoméstico, quiero poder
 * mantener el RNN en la orden pero sacarle la garantía, para que luego en el
 * ACT de entrega indique que está fuera de garantía LG».
 *
 * FG = `garantia_rechazada_motivo` no nulo: la orden deja de ser en garantía
 * (`es_garantia = false`, paga el cliente) y conserva la empresa y el N° de
 * caso. Las dos nulas: las órdenes que ya existen no cambian.
 * `IF NOT EXISTS`: el backend local (synchronize) ya las crea al compilar.
 */
export class GarantiaFueraDeCobertura1789800000021 implements MigrationInterface {
  name = 'GarantiaFueraDeCobertura1789800000021';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "repair_orders" ADD COLUMN IF NOT EXISTS "garantia_rechazada_motivo" text`);
    await q.query(`ALTER TABLE "repair_orders" ADD COLUMN IF NOT EXISTS "garantia_rechazada_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "repair_orders" DROP COLUMN IF EXISTS "garantia_rechazada_at"`);
    await q.query(`ALTER TABLE "repair_orders" DROP COLUMN IF EXISTS "garantia_rechazada_motivo"`);
  }
}
