import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Documentos opción B (13/10/2026): los datos del taller que los papeles al
 * cliente tienen que decir por ley y que hasta ahora no estaban en ningún
 * lado (relevamiento de documentos, secciones B y C).
 *
 * - Identificación del prestador para el pie (Ley 24.240 arts. 10 y 21; RG
 *   1415): razón social, condición frente al IVA, IIBB, inicio de
 *   actividades, correo de contacto y horario de atención.
 * - Lo que se le promete al cliente en la recepción y el presupuesto: costo de
 *   la revisión (y si se descuenta), plazos de presupuesto y de reparación,
 *   canon de guarda desde la intimación (art. 2590 CCyC), cuánto tarda la
 *   revisión en garantía, cuándo se emite la factura y el texto de traslado.
 *
 * Todas nulas o con default: las empresas que ya existen quedan como hoy y
 * los papeles usan el respaldo de cada campo («si está vacío»).
 */
export class DatosLegalesDocumentos1789800000019 implements MigrationInterface {
  name = 'DatosLegalesDocumentos1789800000019';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "company"
        ADD "razon_social" character varying(120),
        ADD "condicion_iva" character varying(30),
        ADD "iibb" character varying(30),
        ADD "inicio_actividades" date,
        ADD "email_contacto" character varying(120),
        ADD "horario_atencion" character varying(120),
        ADD "costo_revision" numeric(12,2) NOT NULL DEFAULT 0,
        ADD "revision_se_descuenta" boolean NOT NULL DEFAULT true,
        ADD "plazo_presupuesto_dias" integer NOT NULL DEFAULT 2,
        ADD "plazo_reparacion_dias" integer NOT NULL DEFAULT 10,
        ADD "canon_guarda_diario" numeric(12,2) NOT NULL DEFAULT 0,
        ADD "revision_garantia_dias" integer NOT NULL DEFAULT 5,
        ADD "factura_momento" character varying(20) NOT NULL DEFAULT 'al_cobrar',
        ADD "traslado_garantia" text
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "company"
        DROP COLUMN "traslado_garantia",
        DROP COLUMN "factura_momento",
        DROP COLUMN "revision_garantia_dias",
        DROP COLUMN "canon_guarda_diario",
        DROP COLUMN "plazo_reparacion_dias",
        DROP COLUMN "plazo_presupuesto_dias",
        DROP COLUMN "revision_se_descuenta",
        DROP COLUMN "costo_revision",
        DROP COLUMN "horario_atencion",
        DROP COLUMN "email_contacto",
        DROP COLUMN "inicio_actividades",
        DROP COLUMN "iibb",
        DROP COLUMN "condicion_iva",
        DROP COLUMN "razon_social"
    `);
  }
}
