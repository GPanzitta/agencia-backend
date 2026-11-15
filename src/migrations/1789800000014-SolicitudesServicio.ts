import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pedidos web de servicio técnico (spec 2026-10-09 §1). Tabla nueva, sin
 * relleno. El número `PW-<año>-0001` es único por empresa; el índice
 * `(company_id, estado)` es el de la bandeja de nuevos.
 */
export class SolicitudesServicio1789800000014 implements MigrationInterface {
  name = 'SolicitudesServicio1789800000014';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "solicitudes_servicio" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "numero" character varying(20) NOT NULL,
        "estado" character varying(12) NOT NULL DEFAULT 'nuevo',
        "nombre" character varying(100) NOT NULL,
        "apellido" character varying(100),
        "telefono" character varying(20) NOT NULL,
        "telefono_alternativo" character varying(20),
        "email" character varying(200),
        "documento" character varying(20),
        "condicion_iva" character varying(30),
        "direccion_principal" text,
        "piso_depto" character varying(100),
        "ciudad" character varying(100),
        "codigo_postal" character varying(20),
        "equipo_tipo" character varying(80) NOT NULL,
        "rubro_id" uuid,
        "marca" character varying(80),
        "modelo" character varying(120),
        "numero_serie" character varying(120),
        "falla" text NOT NULL,
        "modalidad" character varying(10) NOT NULL,
        "franja" character varying(10),
        "origen" character varying(60),
        "fotos" jsonb NOT NULL DEFAULT '[]',
        "motivo_rechazo" text,
        "cliente_id" uuid,
        "orden_id" uuid,
        "atendido_por" uuid,
        "atendido_en" TIMESTAMP WITH TIME ZONE,
        "company_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_solicitudes_servicio" PRIMARY KEY ("id"),
        CONSTRAINT "FK_solicitudes_servicio_empresa" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_solicitudes_servicio_rubro" FOREIGN KEY ("rubro_id") REFERENCES "tipos_equipo"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_solicitudes_servicio_cliente" FOREIGN KEY ("cliente_id") REFERENCES "customers"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_solicitudes_servicio_orden" FOREIGN KEY ("orden_id") REFERENCES "repair_orders"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_solicitudes_servicio_atendido_por" FOREIGN KEY ("atendido_por") REFERENCES "users"("id")
      )`);
    await q.query(`CREATE INDEX "IDX_solicitudes_servicio_empresa_estado" ON "solicitudes_servicio" ("company_id", "estado")`);
    await q.query(`CREATE UNIQUE INDEX "UQ_solicitudes_servicio_empresa_numero" ON "solicitudes_servicio" ("company_id", "numero")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "solicitudes_servicio"`);
  }
}
