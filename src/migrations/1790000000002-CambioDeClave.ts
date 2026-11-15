import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SEG-54 (decisión del dueño, 15/10/2026): cambio y reseteo de clave.
 *
 * - `users.debe_cambiar_clave`: lo prende el reseteo del admin (clave
 *   provisoria) y lo apaga el cambio de clave. Mientras está prendido, el
 *   backend sólo deja usar `/auth/me`, `/auth/cambiar-clave` y
 *   `/auth/logout`, y el ERP manda a la pantalla de cambio. Los usuarios que
 *   ya existen quedan en `false`: nadie tiene que cambiar nada al publicar.
 * - Dos valores nuevos del enum de auditoría: `clave_cambiada` y
 *   `clave_reseteada` (sin la clave, nunca).
 *
 * Riesgo: bajo. Una columna con default (en Postgres 11+ no reescribe la
 * tabla) y `ADD VALUE IF NOT EXISTS`, idempotente. El `down` saca la columna;
 * los valores del enum se quedan (Postgres no los saca sin recrear el tipo).
 */
export class CambioDeClave1790000000002 implements MigrationInterface {
  name = 'CambioDeClave1790000000002';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "debe_cambiar_clave" boolean NOT NULL DEFAULT false`);
    for (const valor of ['clave_cambiada', 'clave_reseteada']) {
      await q.query(`ALTER TYPE "public"."audit_logs_accion_enum" ADD VALUE IF NOT EXISTS '${valor}'`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "debe_cambiar_clave"`);
  }
}
