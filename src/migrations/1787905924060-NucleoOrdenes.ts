import { MigrationInterface, QueryRunner } from "typeorm";

export class NucleoOrdenes1787905924060 implements MigrationInterface {
    name = 'NucleoOrdenes1787905924060'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "equipos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tipo" character varying(80) NOT NULL, "marca" character varying(80), "modelo" character varying(120), "numero_serie" character varying(120), "company_id" uuid, "cliente_id" uuid, CONSTRAINT "PK_451fffd8d175b5b7aadbf5ba760" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5af34828a3acedb593a04b5ece" ON "equipos" ("company_id") `);
        await queryRunner.query(`CREATE TABLE "repair_orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "numero_orden" character varying(20) NOT NULL, "estado" character varying(30) NOT NULL DEFAULT 'recibida', "falla_declarada" text NOT NULL, "accesorios" text, "observaciones_recepcion" text, "tecnico_id" uuid, "diagnostico" text, "monto_presupuestado" numeric(12,2), "presupuesto_vigente_hasta" TIMESTAMP WITH TIME ZONE, "aprobada_via" character varying(20), "motivo_rechazo" text, "company_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cliente_id" uuid, "equipo_id" uuid, "creado_por" uuid, CONSTRAINT "UQ_5047512a4bcaf2475758375f4b2" UNIQUE ("numero_orden", "company_id"), CONSTRAINT "PK_9f91c943f6f3781c232b4f4385f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_fdcb4ff8da670ecc5a841f907c" ON "repair_orders" ("estado") `);
        await queryRunner.query(`CREATE INDEX "IDX_fb13510ce62ae81feeddf25428" ON "repair_orders" ("tecnico_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_9e577f43ae8697b45d33ab33a6" ON "repair_orders" ("company_id") `);
        await queryRunner.query(`CREATE TABLE "repair_order_repuestos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "cantidad" numeric(10,2) NOT NULL DEFAULT '1', "precio_unitario" numeric(12,2), "ingresado" boolean NOT NULL DEFAULT false, "sku_id" uuid, CONSTRAINT "PK_978f61b8eab1f5c02aefacc36b8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_421cafd868266d385eab75355d" ON "repair_order_repuestos" ("order_id") `);
        await queryRunner.query(`CREATE TABLE "repair_order_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "de" character varying(30), "a" character varying(30) NOT NULL, "fecha" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "empleado_id" uuid, "notas" text, "company_id" uuid, CONSTRAINT "PK_c258aad8ee065630de8aa7bb261" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_020fda402c86d3098897871962" ON "repair_order_events" ("order_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_fb2080cab90978222fa1bf7b81" ON "repair_order_events" ("company_id") `);
        await queryRunner.query(`ALTER TABLE "company" ADD "requiere_presupuesto" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "tipo" character varying(5) NOT NULL DEFAULT 'b2c'`);
        await queryRunner.query(`ALTER TABLE "equipos" ADD CONSTRAINT "FK_2872439dfcad82f8968945960a5" FOREIGN KEY ("cliente_id") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "equipos" ADD CONSTRAINT "FK_5af34828a3acedb593a04b5ece5" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "repair_orders" ADD CONSTRAINT "FK_678c876171558263af0c2add8fc" FOREIGN KEY ("cliente_id") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "repair_orders" ADD CONSTRAINT "FK_96d056b883908f5c6d734c5417b" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "repair_orders" ADD CONSTRAINT "FK_fb13510ce62ae81feeddf254281" FOREIGN KEY ("tecnico_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "repair_orders" ADD CONSTRAINT "FK_ddb808dc543f5a207b47ee3d51e" FOREIGN KEY ("creado_por") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "repair_orders" ADD CONSTRAINT "FK_9e577f43ae8697b45d33ab33a69" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "repair_order_repuestos" ADD CONSTRAINT "FK_421cafd868266d385eab75355dd" FOREIGN KEY ("order_id") REFERENCES "repair_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "repair_order_repuestos" ADD CONSTRAINT "FK_703838a96a5659209f005761615" FOREIGN KEY ("sku_id") REFERENCES "ingredients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "repair_order_repuestos" DROP CONSTRAINT "FK_703838a96a5659209f005761615"`);
        await queryRunner.query(`ALTER TABLE "repair_order_repuestos" DROP CONSTRAINT "FK_421cafd868266d385eab75355dd"`);
        await queryRunner.query(`ALTER TABLE "repair_orders" DROP CONSTRAINT "FK_9e577f43ae8697b45d33ab33a69"`);
        await queryRunner.query(`ALTER TABLE "repair_orders" DROP CONSTRAINT "FK_ddb808dc543f5a207b47ee3d51e"`);
        await queryRunner.query(`ALTER TABLE "repair_orders" DROP CONSTRAINT "FK_fb13510ce62ae81feeddf254281"`);
        await queryRunner.query(`ALTER TABLE "repair_orders" DROP CONSTRAINT "FK_96d056b883908f5c6d734c5417b"`);
        await queryRunner.query(`ALTER TABLE "repair_orders" DROP CONSTRAINT "FK_678c876171558263af0c2add8fc"`);
        await queryRunner.query(`ALTER TABLE "equipos" DROP CONSTRAINT "FK_5af34828a3acedb593a04b5ece5"`);
        await queryRunner.query(`ALTER TABLE "equipos" DROP CONSTRAINT "FK_2872439dfcad82f8968945960a5"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "tipo"`);
        await queryRunner.query(`ALTER TABLE "company" DROP COLUMN "requiere_presupuesto"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fb2080cab90978222fa1bf7b81"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_020fda402c86d3098897871962"`);
        await queryRunner.query(`DROP TABLE "repair_order_events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_421cafd868266d385eab75355d"`);
        await queryRunner.query(`DROP TABLE "repair_order_repuestos"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9e577f43ae8697b45d33ab33a6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fb13510ce62ae81feeddf25428"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fdcb4ff8da670ecc5a841f907c"`);
        await queryRunner.query(`DROP TABLE "repair_orders"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5af34828a3acedb593a04b5ece"`);
        await queryRunner.query(`DROP TABLE "equipos"`);
    }

}
