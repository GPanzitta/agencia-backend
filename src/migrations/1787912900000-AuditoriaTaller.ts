import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T2 — Auditoría del ciclo del taller: el enum de Postgres suma las tres
 * acciones de no retorno de una orden. Los valores gastronómicos del sistema
 * madre quedan en el tipo (sacar valores de un enum PG es cirugía mayor y no
 * aporta nada); simplemente ya no se emiten.
 */
export class AuditoriaTaller1787912900000 implements MigrationInterface {
  name = 'AuditoriaTaller1787912900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // PG 12+ acepta ADD VALUE dentro de transacción mientras el valor nuevo
    // no se use en la misma transacción (acá no se usa).
    await queryRunner.query(
      `ALTER TYPE "audit_logs_accion_enum" ADD VALUE IF NOT EXISTS 'presupuesto_aprobado'`,
    );
    await queryRunner.query(
      `ALTER TYPE "audit_logs_accion_enum" ADD VALUE IF NOT EXISTS 'presupuesto_rechazado'`,
    );
    await queryRunner.query(
      `ALTER TYPE "audit_logs_accion_enum" ADD VALUE IF NOT EXISTS 'orden_entregada'`,
    );
  }

  public async down(): Promise<void> {
    // Los valores de un enum PG no se pueden quitar sin recrear el tipo;
    // quedan inofensivos si se revierte el código.
  }
}
