import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SEG-48 (decisión del dueño, 15/10/2026): el comprobante de transferencia
 * extiende la reserva 48 h, UNA sola vez. Hasta ahora subirlo dejaba
 * `reserva_vence_at` en null y la pieza quedaba apartada sin plazo.
 *
 * - `reserva_extendida_at`: cuándo el primer comprobante extendió la reserva.
 *   Un segundo comprobante la ve cargada y no vuelve a extender.
 * - Las ventas que YA están en ese limbo (transferencia pendiente, con
 *   comprobante y sin vencimiento) reciben las mismas 48 h, contadas desde que
 *   corre la migración: no vencen de golpe al publicar y tampoco quedan
 *   apartadas para siempre. Quedan marcadas como extendidas.
 *
 * El `down` saca la columna y NO vuelve a poner en null los vencimientos que
 * cargó el `up`: borrar un plazo es lo que se quería arreglar, y una reserva
 * con vencimiento es válida también para el código anterior.
 * `IF NOT EXISTS`: el backend local (synchronize) ya la crea al compilar.
 */
export class ExtensionReservaComprobante1790000000001 implements MigrationInterface {
  name = 'ExtensionReservaComprobante1790000000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ventas_tienda" ADD COLUMN IF NOT EXISTS "reserva_extendida_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`
      UPDATE "ventas_tienda"
         SET "reserva_vence_at" = now() + interval '48 hours',
             "reserva_extendida_at" = now()
       WHERE "estado" = 'pendiente_pago'
         AND "medio_pago" = 'transferencia'
         AND "comprobante_subido_at" IS NOT NULL
         AND "reserva_vence_at" IS NULL
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ventas_tienda" DROP COLUMN IF EXISTS "reserva_extendida_at"`);
  }
}
