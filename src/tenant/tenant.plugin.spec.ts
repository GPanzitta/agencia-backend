import * as path from 'path';
import { DataSource } from 'typeorm';
import { applyTenantPatch } from './tenant.plugin';
import { tenantContext } from './tenant.context';
import { Expense } from '../expenses/entities/expense.entity';
import { hayBaseParaTests } from '../common/testing/env-de-tests';

/**
 * Regresión del aislamiento multi-empresa.
 *
 * El agujero que cubren estos tests: `QueryBuilder.where()` de TypeORM NO
 * acumula condiciones, las REEMPLAZA (`expressionMap.wheres = []`). El parche
 * de tenant inyectaba el filtro de empresa al crear el builder, así que
 * cualquier servicio que escribiera `createQueryBuilder('x').where(...)` lo
 * borraba sin darse cuenta y terminaba leyendo los datos de todos los locales.
 * Había 19 llamadas así en el código.
 *
 * Estos tests construyen el SQL y lo inspeccionan; no ejecutan ninguna consulta
 * ni tocan datos.
 */

// El parche es global sobre los prototipos de TypeORM: se aplica una sola vez.
applyTenantPatch();

const COMPANY_A = '11111111-1111-4111-8111-111111111111';

const filtrosDeEmpresa = (sql: string) => (sql.match(/"company_id"\s*=/g) || []).length;

// Se resuelve en tiempo de carga del archivo: `describe` arma la lista de
// tests antes de que corra `beforeAll`, así que la decisión de saltear no
// puede depender de algo que se setea ahí adentro.
// Carga el .env sin pisar variables presentes y saltea si apunta a producción
// (ver env-de-tests.ts).
const HAY_DB = hayBaseParaTests();
const conDs = HAY_DB ? it : it.skip;

describe('tenant.plugin — aislamiento por empresa', () => {
  let ds: DataSource;

  beforeAll(async () => {
    if (!HAY_DB) return;
    ds = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: true },
      entities: [path.resolve(__dirname, '../**/*.entity.{ts,js}')],
    });
    await ds.initialize();
  }, 60_000);

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  conDs('mantiene el filtro aunque el servicio llame a .where()', () => {
    const repo = ds.getRepository(Expense);
    tenantContext.run(COMPANY_A, () => {
      const sql = repo.createQueryBuilder('e').where('e.estado = true').getSql();
      expect(filtrosDeEmpresa(sql)).toBe(1);
    });
  });

  conDs('mantiene el filtro con .andWhere()', () => {
    const repo = ds.getRepository(Expense);
    tenantContext.run(COMPANY_A, () => {
      const sql = repo.createQueryBuilder('e').andWhere('e.estado = true').getSql();
      expect(filtrosDeEmpresa(sql)).toBe(1);
    });
  });

  conDs('mantiene el filtro con .where() llamado más de una vez', () => {
    const repo = ds.getRepository(Expense);
    tenantContext.run(COMPANY_A, () => {
      const sql = repo
        .createQueryBuilder('e')
        .where('e.estado = true')
        .where('e.monto > 0')
        .getSql();
      expect(filtrosDeEmpresa(sql)).toBe(1);
    });
  });

  conDs('filtra también por EntityManager (usado dentro de transacciones)', () => {
    tenantContext.run(COMPANY_A, () => {
      const sql = ds.manager
        .createQueryBuilder(Expense, 'e')
        .where('e.estado = true')
        .getSql();
      expect(filtrosDeEmpresa(sql)).toBe(1);
    });
  });

  conDs('no duplica la condición al pasar por Repository y EntityManager', () => {
    const repo = ds.getRepository(Expense);
    tenantContext.run(COMPANY_A, () => {
      const sql = repo.createQueryBuilder('e').getSql();
      expect(filtrosDeEmpresa(sql)).toBe(1);
    });
  });

  conDs('no filtra cuando no hay contexto (seed, webhooks, tienda pública)', () => {
    const repo = ds.getRepository(Expense);
    const sql = repo.createQueryBuilder('e').where('e.estado = true').getSql();
    expect(filtrosDeEmpresa(sql)).toBe(0);
  });

  conDs('la empresa del contexto le gana a la que venga del cliente', () => {
    const repo = ds.getRepository(Expense);
    tenantContext.run(COMPANY_A, () => {
      // Varios DTOs del ERP aceptan companyId; antes ese valor ganaba y se
      // podían cargar gastos en los libros de otro local.
      const entidad: any = repo.create({ companyId: 'otra-empresa' } as any);
      expect(entidad.companyId).toBe(COMPANY_A);
    });
  });
});
