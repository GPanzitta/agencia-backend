import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Síntomas configurables (spec 2026-10-11): la consola de la portada pasa a
 * leer `perfil_publico.sintomas`. NULL = el taller no lo editó y rige la lista
 * de fábrica, así que ninguna fila existente necesita datos.
 *
 * Y el motivo de rechazo deja de poder quedar vacío (`rechazo.util.ts`): la
 * encuesta, el aviso que invita a opinar y el acta de entrega lo usan para
 * saber que el equipo se devolvió sin reparar. Las órdenes que el mostrador
 * rechazó sin escribir motivo se completan con el texto por defecto. Una orden
 * rechazada sólo pasa a entregada, así que alcanza con mirar si alguna vez
 * entró en `rechazada`.
 */
export class SintomasYMotivoRechazo1789800000015 implements MigrationInterface {
  name = 'SintomasYMotivoRechazo1789800000015';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "perfil_publico" ADD COLUMN IF NOT EXISTS "sintomas" jsonb`);
    await q.query(`
      UPDATE "repair_orders" o
         SET "motivo_rechazo" = 'Presupuesto no aprobado'
       WHERE ("motivo_rechazo" IS NULL OR btrim("motivo_rechazo") = '')
         AND (o."estado" = 'rechazada'
              OR EXISTS (SELECT 1 FROM "repair_order_events" e WHERE e."order_id" = o."id" AND e."a" = 'rechazada'))
    `);
  }

  /**
   * El completado del motivo no se deshace: no hay forma de distinguir el
   * texto puesto acá del que eligió el sistema después, y vaciarlo volvería a
   * pedirle opinión a quien se llevó el equipo sin reparar.
   */
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "perfil_publico" DROP COLUMN IF EXISTS "sintomas"`);
  }
}
