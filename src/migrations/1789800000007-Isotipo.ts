import { MigrationInterface, QueryRunner } from 'typeorm';

/** Landing 01/10/2026 (spec §3.1): el isotipo del taller, aparte del logo. */
export class Isotipo1789800000007 implements MigrationInterface {
  name = 'Isotipo1789800000007';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "perfil_publico" ADD "isotipo_url" text`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "perfil_publico" DROP COLUMN "isotipo_url"`);
  }
}
