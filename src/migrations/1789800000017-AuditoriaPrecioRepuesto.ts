import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * STK-06 (auditoría 13/10/2026): el precio de lista, el precio anterior y el
 * costo de un repuesto se cambiaban por el PATCH general sin dejar rastro, y
 * el mostrador podía borrar el precio de lista para saltear su tope de
 * descuento. Ahora sólo los cambia pañol o admin, y cada cambio queda en la
 * auditoría con el valor de antes y el de después: hace falta la acción.
 *
 * `precio_modificado` ya existía en la base fundacional (heredada); en las
 * bases donde se perdió se vuelve a agregar. `IF NOT EXISTS`: idempotente.
 */
export class AuditoriaPrecioRepuesto1789800000017 implements MigrationInterface {
  name = 'AuditoriaPrecioRepuesto1789800000017';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "public"."audit_logs_accion_enum" ADD VALUE IF NOT EXISTS 'precio_modificado'`);
  }

  /**
   * Postgres no saca valores de un enum sin recrear el tipo, y las filas que
   * ya lo usan quedarían huérfanas. Se deja: un valor sin uso no molesta.
   */
  public async down(): Promise<void> {}
}
