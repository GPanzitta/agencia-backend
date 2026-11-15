import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agencia (13/11/2026): el cliente pide desde el sitio que le coticen su auto
 * y la agencia le contesta con un valor. Queda en el interesado.
 *
 * Riesgo: ninguno. Columnas nuevas, con valor por defecto o vacías.
 */
export class CotizacionDelUsado1790000000027 implements MigrationInterface {
  name = 'CotizacionDelUsado1790000000027';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "interesados" ADD COLUMN IF NOT EXISTS "cotizacion_pedida" boolean NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE "interesados" ADD COLUMN IF NOT EXISTS "cotizacion_valor" numeric(14,2)`);
    await q.query(`ALTER TABLE "interesados" ADD COLUMN IF NOT EXISTS "cotizacion_moneda" varchar(3)`);
    await q.query(`ALTER TABLE "interesados" ADD COLUMN IF NOT EXISTS "cotizacion_fecha" date`);
    await q.query(`ALTER TABLE "interesados" DROP CONSTRAINT IF EXISTS "CHK_interesados_cotizacion"`);
    await q.query(`ALTER TABLE "interesados" ADD CONSTRAINT "CHK_interesados_cotizacion" CHECK (("cotizacion_valor" IS NULL OR "cotizacion_valor" > 0) AND ("cotizacion_moneda" IS NULL OR "cotizacion_moneda" IN ('ARS', 'USD')))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.dropCheckConstraint('interesados', 'CHK_interesados_cotizacion');
    await q.dropColumns('interesados', ['cotizacion_pedida', 'cotizacion_valor', 'cotizacion_moneda', 'cotizacion_fecha']);
  }
}
