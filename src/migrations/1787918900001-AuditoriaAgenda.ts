import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T6a — Las tres acciones de agenda que dejan rastro: agendar, reprogramar y
 * cancelar un turno. Un compromiso con el cliente que se mueve o se cae tiene
 * que poder rastrearse hasta quién lo movió.
 */
export class AuditoriaAgenda1787918900001 implements MigrationInterface {
  name = 'AuditoriaAgenda1787918900001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "audit_logs_accion_enum" ADD VALUE IF NOT EXISTS 'turno_agendado'`,
    );
    await queryRunner.query(
      `ALTER TYPE "audit_logs_accion_enum" ADD VALUE IF NOT EXISTS 'turno_reprogramado'`,
    );
    await queryRunner.query(
      `ALTER TYPE "audit_logs_accion_enum" ADD VALUE IF NOT EXISTS 'turno_cancelado'`,
    );
  }

  public async down(): Promise<void> {
    // Los valores de un enum PG no se pueden quitar sin recrear el tipo.
  }
}
