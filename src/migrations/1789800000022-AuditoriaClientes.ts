import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DAT-02 (integridad, 14/10/2026): cada alta, edición, baja, reactivación e
 * importación masiva de clientes queda en la auditoría. Hacen falta los
 * valores nuevos del enum de acciones.
 *
 * Riesgo: bajo. `ADD VALUE IF NOT EXISTS` es idempotente y no reescribe la
 * tabla. Ojo: en Postgres < 12 no corre dentro de una transacción; Neon usa
 * 15+, así que va con la transacción de siempre de TypeORM.
 *
 * SIN CORRER. Hasta que corra, la auditoría de clientes no se graba (el
 * servicio lo anota en el log y sigue: el alta o la edición no se cae).
 * Correrla antes de publicar el backend.
 */
export class AuditoriaClientes1789800000022 implements MigrationInterface {
  name = 'AuditoriaClientes1789800000022';

  public async up(q: QueryRunner): Promise<void> {
    for (const valor of ['cliente_creado', 'cliente_editado', 'cliente_dado_de_baja', 'cliente_reactivado', 'clientes_importados']) {
      await q.query(`ALTER TYPE "public"."audit_logs_accion_enum" ADD VALUE IF NOT EXISTS '${valor}'`);
    }
  }

  /** Postgres no saca valores de un enum sin recrear el tipo. Se dejan. */
  public async down(): Promise<void> {}
}
