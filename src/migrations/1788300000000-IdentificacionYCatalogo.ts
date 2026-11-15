import { MigrationInterface, QueryRunner } from 'typeorm';
import { textoDeBusqueda } from '../ingredientes/texto-busqueda.util';

/**
 * Sub-proyecto C5 — Identificación y catálogo de repuestos (spec §4).
 *
 * Una sola migración para todo el modelo, aunque C5a la consuma de a partes:
 * dos migraciones a medias sobre las mismas tablas son más difíciles de
 * revertir que una entera (mismo criterio que 1788200000000-PanolYCompras).
 *
 * El backfill de `texto_busqueda` está al final del `up()` y se hace en
 * TypeScript, con la MISMA función pura que usa el servicio: si la regla de
 * normalización cambia, cambia en un solo archivo y no hay SQL que quede
 * diciendo otra cosa (spec §2.1).
 */
export class IdentificacionYCatalogo1788300000000 implements MigrationInterface {
  name = 'IdentificacionYCatalogo1788300000000';

  public async up(q: QueryRunner): Promise<void> {
    // ─── ingredients: la identidad completa de la pieza ─────────────────────
    await q.query(`ALTER TABLE "ingredients" ADD "numero_parte" character varying(80)`);
    await q.query(`ALTER TABLE "ingredients" ADD "modelo" character varying(80)`);
    await q.query(`ALTER TABLE "ingredients" ADD "texto_busqueda" text NOT NULL DEFAULT ''`);
    await q.query(`ALTER TABLE "ingredients" ADD "fusionado_en_id" uuid`);
    await q.query(
      `ALTER TABLE "ingredients" ADD CONSTRAINT "FK_ingredients_fusionado_en" FOREIGN KEY ("fusionado_en_id") REFERENCES "ingredients"("id") ON DELETE SET NULL`,
    );
    // Se indexa lo que se consulta por igualdad. `texto_busqueda` NO lleva
    // índice: un LIKE '%x%' no usa B-tree y el GIN trigram exige
    // CREATE EXTENSION pg_trgm sobre una base gestionada (spec §2.1).
    await q.query(
      `CREATE INDEX "IDX_ingredients_company_numero_parte" ON "ingredients" ("company_id", "numero_parte")`,
    );
    await q.query(
      `CREATE INDEX "IDX_ingredients_fusionado_en" ON "ingredients" ("fusionado_en_id")`,
    );

    // ─── repuesto_codigos: los otros nombres de la misma pieza ──────────────
    await q.query(`
      CREATE TABLE "repuesto_codigos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "ingredient_id" uuid NOT NULL,
        "codigo" character varying(60) NOT NULL,
        "codigo_normalizado" character varying(60) NOT NULL,
        "tipo" character varying(12) NOT NULL DEFAULT 'alternativo',
        "proveedor_id" uuid,
        "nota" character varying(120),
        "company_id" uuid,
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_repuesto_codigos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_rcod_ingredient" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rcod_proveedor" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_rcod_company" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);
    // COALESCE por el mismo motivo que en PanolYCompras: en Postgres NULL ≠
    // NULL, y sin esto las filas sin empresa se duplicarían libremente.
    await q.query(
      `CREATE UNIQUE INDEX "UQ_rcod_codigo_empresa" ON "repuesto_codigos" ("codigo_normalizado", COALESCE("company_id", '00000000-0000-0000-0000-000000000000'))`,
    );
    await q.query(`CREATE INDEX "IDX_rcod_ingredient" ON "repuesto_codigos" ("ingredient_id")`);

    // ─── repuesto_sinonimos: el diccionario del taller ──────────────────────
    await q.query(`
      CREATE TABLE "repuesto_sinonimos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "grupo" uuid NOT NULL,
        "termino" character varying(40) NOT NULL,
        "termino_normalizado" character varying(40) NOT NULL,
        "company_id" uuid,
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_repuesto_sinonimos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sin_company" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE
      )
    `);
    // Un término pertenece a UN grupo: si pudiera estar en dos, la expansión
    // dependería del orden en que se leyeron las filas (spec §4.3).
    await q.query(
      `CREATE UNIQUE INDEX "UQ_sin_termino_empresa" ON "repuesto_sinonimos" ("termino_normalizado", COALESCE("company_id", '00000000-0000-0000-0000-000000000000'))`,
    );
    await q.query(`CREATE INDEX "IDX_sin_grupo" ON "repuesto_sinonimos" ("grupo")`);
    // Sin siembra a propósito: un diccionario cargado por migración en todos
    // los talleres es vocabulario ajeno metido en la base de cada uno. Los tres
    // grupos del oficio los ofrece la pantalla de Configuración (C5b).

    // ─── unidades del taller ────────────────────────────────────────────────
    // `G` y `ML` se quedan en el tipo (de un enum de Postgres no se borran
    // valores) pero salen del contrato: los DTO validan contra `UnidadTaller`.
    for (const v of ['PAR', 'JGO', 'MT', 'ROLLO']) {
      await q.query(`ALTER TYPE "public"."ingredients_unit_enum" ADD VALUE IF NOT EXISTS '${v}'`);
    }

    // ─── auditoría ──────────────────────────────────────────────────────────
    await q.query(
      `ALTER TYPE "public"."audit_logs_accion_enum" ADD VALUE IF NOT EXISTS 'repuesto_fusionado'`,
    );

    // ─── backfill de texto_busqueda ─────────────────────────────────────────
    // En TypeScript y con la MISMA función que usa el servicio, no con SQL:
    // `unaccent` es una extensión que esta migración no controla en una base
    // gestionada, y una regla escrita dos veces se desincroniza sola (§2.1).
    // De a 500 para no traerse un catálogo entero a memoria.
    const PAGINA = 500;
    for (let offset = 0; ; offset += PAGINA) {
      const filas: Array<{
        id: string;
        name: string | null;
        codigo: string | null;
        numero_parte: string | null;
        marca: string | null;
        modelo: string | null;
        categoria: string | null;
      }> = await q.query(
        `SELECT "id", "name", "codigo", "numero_parte", "marca", "modelo", "categoria"
         FROM "ingredients" ORDER BY "id" LIMIT ${PAGINA} OFFSET ${offset}`,
      );
      if (filas.length === 0) break;
      for (const f of filas) {
        await q.query(`UPDATE "ingredients" SET "texto_busqueda" = $1 WHERE "id" = $2`, [
          textoDeBusqueda(f),
          f.id,
        ]);
      }
      if (filas.length < PAGINA) break;
    }
    // Los aliases no se backfillean: `repuesto_codigos` se acaba de crear y
    // está vacía. El primer alias que se cargue dispara
    // `recalcularTextoBusqueda()` desde el servicio.
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "public"."IDX_sin_grupo"`);
    await q.query(`DROP INDEX "public"."UQ_sin_termino_empresa"`);
    await q.query(`DROP TABLE "repuesto_sinonimos"`);
    await q.query(`DROP INDEX "public"."IDX_rcod_ingredient"`);
    await q.query(`DROP INDEX "public"."UQ_rcod_codigo_empresa"`);
    await q.query(`DROP TABLE "repuesto_codigos"`);
    await q.query(`DROP INDEX "public"."IDX_ingredients_fusionado_en"`);
    await q.query(`DROP INDEX "public"."IDX_ingredients_company_numero_parte"`);
    await q.query(`ALTER TABLE "ingredients" DROP CONSTRAINT "FK_ingredients_fusionado_en"`);
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN "fusionado_en_id"`);
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN "texto_busqueda"`);
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN "modelo"`);
    await q.query(`ALTER TABLE "ingredients" DROP COLUMN "numero_parte"`);
    // Los valores agregados a los dos enums NO se revierten: Postgres no
    // soporta DROP VALUE. Es la misma nota que dejó PanolYCompras.
  }
}
