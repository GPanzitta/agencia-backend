import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tienda, etapa 1: capa comercial (spec 2026-10-07 tienda §3). Precio
 * anterior e IVA del repuesto; cuotas, transferencia, IVA por defecto y envío
 * gratis de la empresa; descuento, comprobante y zona de la venta; y la tabla
 * `zonas_envio`.
 *
 * Relleno §3.3: cada empresa con envío habilitado recibe una zona «Envío a
 * domicilio» que cubre 1000–9999 con su costo fijo de siempre, así nadie
 * pierde lo configurado. `costo_envio_tienda` queda en la tabla; el código
 * deja de leerlo.
 */
export class TiendaCapaComercial1789800000010 implements MigrationInterface {
  name = 'TiendaCapaComercial1789800000010';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ingredients"
        ADD "precio_anterior" numeric(12,2),
        ADD "alicuota_iva" numeric(4,2)`);

    await q.query(`ALTER TABLE "company"
        ADD "alicuota_iva_defecto" numeric(4,2) NOT NULL DEFAULT 21,
        ADD "cuotas_tienda" jsonb NOT NULL DEFAULT '[]',
        ADD "transferencia_tienda_habilitada" boolean NOT NULL DEFAULT false,
        ADD "transferencia_descuento_porcentaje" numeric(5,2) NOT NULL DEFAULT 0,
        ADD "transferencia_cbu" character varying(22),
        ADD "transferencia_alias" character varying(40),
        ADD "transferencia_titular" character varying(120),
        ADD "envio_gratis_desde" numeric(12,2)`);

    await q.query(`
      CREATE TABLE "zonas_envio" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid NOT NULL,
        "nombre" character varying(60) NOT NULL,
        "rangos" jsonb NOT NULL,
        "costo" numeric(12,2) NOT NULL,
        "dias_min" integer,
        "dias_max" integer,
        "orden" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_zonas_envio" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_zonas_envio_costo" CHECK ("costo" >= 0),
        CONSTRAINT "CHK_zonas_envio_dias" CHECK ("dias_min" IS NULL OR "dias_max" IS NULL OR "dias_min" <= "dias_max"),
        CONSTRAINT "FK_zonas_envio_empresa" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX "IDX_zonas_envio_empresa_orden" ON "zonas_envio" ("company_id", "orden")`);

    await q.query(`ALTER TABLE "ventas_tienda"
        ADD "descuento" numeric(12,2) NOT NULL DEFAULT 0,
        ADD "comprobante_url" text,
        ADD "comprobante_nombre" character varying(160),
        ADD "comprobante_subido_at" TIMESTAMP WITH TIME ZONE,
        ADD "comprobante_rechazo" text,
        ADD "zona_envio_nombre" character varying(60)`);

    // Relleno §3.3: nadie pierde el envío que tenía configurado.
    await q.query(`INSERT INTO "zonas_envio" ("company_id", "nombre", "rangos", "costo", "orden")
        SELECT "id", 'Envío a domicilio', '[{"desde":1000,"hasta":9999}]'::jsonb, "costo_envio_tienda", 0
        FROM "company" WHERE "envio_habilitado" = true`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ventas_tienda"
        DROP COLUMN "zona_envio_nombre",
        DROP COLUMN "comprobante_rechazo",
        DROP COLUMN "comprobante_subido_at",
        DROP COLUMN "comprobante_nombre",
        DROP COLUMN "comprobante_url",
        DROP COLUMN "descuento"`);
    await q.query(`DROP TABLE "zonas_envio"`);
    await q.query(`ALTER TABLE "company"
        DROP COLUMN "envio_gratis_desde",
        DROP COLUMN "transferencia_titular",
        DROP COLUMN "transferencia_alias",
        DROP COLUMN "transferencia_cbu",
        DROP COLUMN "transferencia_descuento_porcentaje",
        DROP COLUMN "transferencia_tienda_habilitada",
        DROP COLUMN "cuotas_tienda",
        DROP COLUMN "alicuota_iva_defecto"`);
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN "alicuota_iva", DROP COLUMN "precio_anterior"`);
  }
}
