import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Observaciones de la ENTREGA (13/10/2026): pedido del dueño, «dos campos de
 * observaciones en la orden: las del ingreso y las de la entrega, y que se
 * vean en el documento». Las del ingreso ya existían
 * (`observaciones_recepcion`); ésta es la de la entrega. Nula: las órdenes
 * que ya existen quedan sin observaciones de entrega y el papel muestra «—».
 * `IF NOT EXISTS`: el backend local (synchronize) ya la crea al compilar.
 */
export class ObservacionesEntrega1789800000020 implements MigrationInterface {
  name = 'ObservacionesEntrega1789800000020';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "repair_orders" ADD COLUMN IF NOT EXISTS "observaciones_entrega" text`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "repair_orders" DROP COLUMN IF EXISTS "observaciones_entrega"`);
  }
}
