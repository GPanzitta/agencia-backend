// @ts-nocheck
import { Repository, EntityManager } from 'typeorm';
import { tenantContext } from './tenant.context';

/**
 * Aislamiento multi-empresa a nivel de TypeORM.
 *
 * Todas las consultas y escrituras se filtran/completan con la empresa del
 * usuario que hizo el request (`tenantContext`). Si no hay contexto de empresa
 * —seed, webhooks, endpoints públicos de la tienda— el parche no interviene.
 *
 * Cubre `Repository` y también `EntityManager`, que es el que se usa dentro de
 * las transacciones (`queryRunner.manager.*`). Sin eso, justamente las
 * operaciones más sensibles —alta de venta, cobros— quedaban sin filtrar.
 */
export function applyTenantPatch() {
  // `metadata.columns`/`relations` se recorrían en cada llamada a cada método
  // de cada repositorio. Es información fija por entidad: se calcula una vez.
  const companyFlagCache = new WeakMap();

  const hasCompany = (metadata: any): boolean => {
    if (!metadata) return false;
    const cached = companyFlagCache.get(metadata);
    if (cached !== undefined) return cached;
    const flag =
      metadata.relations.some((rel) => rel.propertyName === 'company') ||
      metadata.columns.some((col) => col.propertyName === 'companyId');
    companyFlagCache.set(metadata, flag);
    return flag;
  };

  const companyDbColumn = (metadata: any): string => {
    const col = metadata.columns.find((c) => c.propertyName === 'companyId');
    return col ? col.databaseName : 'company_id';
  };

  /**
   * Cómo se filtra por empresa en un `where` de find: por la RELACIÓN
   * `company` si la entidad la expone, o por la COLUMNA plana `companyId`.
   * Las tablas de telemetría (eventos de órdenes) solo tienen la columna, y
   * filtrarlas con `company: { id }` tiraba EntityPropertyNotFoundError.
   */
  const companyWhereFor = (metadata: any, companyId: string): Record<string, unknown> | null => {
    if (!metadata) return null;
    if (metadata.relations.some((rel: any) => rel.propertyName === 'company')) {
      return { company: { id: companyId } };
    }
    if (metadata.columns.some((col: any) => col.propertyName === 'companyId')) {
      return { companyId };
    }
    return null;
  };

  /**
   * Metadata de la entidad a partir de un EntityManager. El target puede venir
   * como clase o como nombre de entidad; si no está registrada, devuelve null
   * y el parche no interviene.
   */
  const metadataFor = (manager: any, target: any) => {
    if (!target) return null;
    try {
      return manager.connection.getMetadata(target);
    } catch {
      return null;
    }
  };

  const patchFindOptions = (options: any, metadata: any) => {
    const companyId = tenantContext.getStore();
    const filtro = companyId ? companyWhereFor(metadata, companyId) : null;
    if (filtro) {
      options = options || {};
      if (options.where) {
        if (Array.isArray(options.where)) {
          options.where = options.where.map(w => ({ ...w, ...filtro }));
        } else {
          Object.assign(options.where, filtro);
        }
      } else {
        options.where = { ...filtro };
      }
    }
    return options;
  };

  const patchWhere = (where: any, metadata: any) => {
    const companyId = tenantContext.getStore();
    const filtro = companyId ? companyWhereFor(metadata, companyId) : null;
    if (!filtro) return where;
    if (Array.isArray(where)) {
      return where.map(w => ({ ...w, ...filtro }));
    }
    return { ...where, ...filtro };
  };

  /**
   * Aplica el filtro de empresa a un QueryBuilder y —esto es lo importante—
   * lo vuelve a aplicar si alguien llama a `.where()` después.
   *
   * `.where()` de TypeORM NO acumula: hace `expressionMap.wheres = []` y
   * reemplaza (SelectQueryBuilder.js:341). Cualquier servicio que escribiera
   * `createQueryBuilder('x').where(...)` borraba sin saberlo el filtro de
   * empresa y terminaba consultando los datos de todos los locales.
   *
   * En vez de corregir las 19 llamadas que hacían eso —y quedar expuestos a la
   * número 20 que escriba el próximo que toque el código— se envuelve `.where`
   * para que reponga el filtro inmediatamente después de resetear. El servicio
   * sigue viendo la semántica documentada de TypeORM; el aislamiento deja de
   * depender de que nadie se olvide.
   */
  const applyTenantScope = (qb: any, metadata: any, alias: string) => {
    const companyId = tenantContext.getStore();
    if (!companyId || !hasCompany(metadata)) return qb;

    // `Repository.createQueryBuilder` delega internamente en
    // `EntityManager.createQueryBuilder`, y los dos están parcheados: sin esta
    // marca la condición se agregaba dos veces al mismo builder.
    if (qb.__tenantScoped) return qb;
    qb.__tenantScoped = true;

    const effectiveAlias = alias || metadata.targetName;
    const condition = `${effectiveAlias}.${companyDbColumn(metadata)} = :tenantCompanyId`;

    qb.andWhere(condition, { tenantCompanyId: companyId });

    const originalWhere = qb.where.bind(qb);
    qb.where = function (...args: any[]) {
      originalWhere(...args);
      qb.andWhere(condition, { tenantCompanyId: companyId });
      return qb;
    };

    return qb;
  };

  // ─── Repository ────────────────────────────────────────────────────────────

  const originalFind = Repository.prototype.find;
  Repository.prototype.find = function (options) {
    return originalFind.call(this, patchFindOptions(options, this.metadata));
  };

  const originalFindOne = Repository.prototype.findOne;
  Repository.prototype.findOne = function (options) {
    return originalFindOne.call(this, patchFindOptions(options, this.metadata));
  };

  const originalFindAndCount = Repository.prototype.findAndCount;
  Repository.prototype.findAndCount = function (options) {
    return originalFindAndCount.call(this, patchFindOptions(options, this.metadata));
  };

  const originalCount = Repository.prototype.count;
  Repository.prototype.count = function (options) {
    return originalCount.call(this, patchFindOptions(options, this.metadata));
  };

  const originalFindOneBy = Repository.prototype.findOneBy;
  Repository.prototype.findOneBy = function (where) {
    return originalFindOneBy.call(this, patchWhere(where, this.metadata));
  };

  const originalFindBy = Repository.prototype.findBy;
  Repository.prototype.findBy = function (where) {
    return originalFindBy.call(this, patchWhere(where, this.metadata));
  };

  const originalCreateQueryBuilder = Repository.prototype.createQueryBuilder;
  Repository.prototype.createQueryBuilder = function (alias, queryRunner) {
    const qb = originalCreateQueryBuilder.call(this, alias, queryRunner);
    return applyTenantScope(qb, this.metadata, alias);
  };

  const originalUpdate = Repository.prototype.update;
  Repository.prototype.update = function (criteria, partialEntity) {
    const companyId = tenantContext.getStore();
    if (companyId && hasCompany(this.metadata)) {
      if (typeof criteria === 'string' || typeof criteria === 'number' || Array.isArray(criteria)) {
        criteria = { id: criteria, companyId } as any;
      } else {
        criteria = { ...criteria, companyId } as any;
      }
    }
    return originalUpdate.call(this, criteria, partialEntity);
  };

  const originalDelete = Repository.prototype.delete;
  Repository.prototype.delete = function (criteria) {
    const companyId = tenantContext.getStore();
    if (companyId && hasCompany(this.metadata)) {
      if (typeof criteria === 'string' || typeof criteria === 'number' || Array.isArray(criteria)) {
        criteria = { id: criteria, companyId } as any;
      } else {
        criteria = { ...criteria, companyId } as any;
      }
    }
    return originalDelete.call(this, criteria);
  };

  /**
   * Fija la empresa del contexto en lo que se está por guardar.
   *
   * Antes solo completaba cuando el campo venía vacío (`!e.companyId`), así que
   * un companyId mandado desde el cliente ganaba: varios DTOs del ERP lo
   * aceptan (`create-expense`, `crear-presupuesto`, `crear-recurrente`), con lo
   * cual un usuario de un local podía cargar gastos o presupuestos en los
   * libros de otro. Con contexto activo, la empresa del token manda siempre.
   *
   * El superadmin no tiene empresa asignada, así que para él no hay contexto y
   * este bloque no corre: el alta de empresas nuevas sigue funcionando igual.
   */
  const injectCompanyInto = (target: any, companyId: string) => {
    const inject = (e) => {
      if (!e || typeof e !== 'object') return;
      e.companyId = companyId;
      // Si venía la relación apuntando a otra empresa, se descarta para que no
      // le gane a la columna.
      if (e.company && e.company.id && e.company.id !== companyId) {
        e.company = undefined;
      }
    };
    if (Array.isArray(target)) target.forEach(inject);
    else inject(target);
  };

  const originalCreate = Repository.prototype.create;
  Repository.prototype.create = function (entityLikeArrayOrPlainObject, ...args) {
    const result = originalCreate.call(this, entityLikeArrayOrPlainObject, ...args);
    const companyId = tenantContext.getStore();
    if (companyId && hasCompany(this.metadata) && result) {
      injectCompanyInto(result, companyId);
    }
    return result;
  };

  const originalSave = Repository.prototype.save;
  Repository.prototype.save = function (entityOrEntities, options) {
    const companyId = tenantContext.getStore();
    if (companyId && hasCompany(this.metadata) && entityOrEntities) {
      injectCompanyInto(entityOrEntities, companyId);
    }
    return originalSave.call(this, entityOrEntities, options);
  };

  // ─── EntityManager ─────────────────────────────────────────────────────────
  //
  // `queryRunner.manager.*` y `dataSource.manager.*` no pasan por Repository,
  // así que quedaban completamente fuera del aislamiento. Las escrituras las
  // cubría el TenantSubscriber (beforeInsert), pero las LECTURAS no: dentro de
  // una transacción se podía leer un modificador o un medio de pago de otra
  // empresa pasando su id.

  const emFindMethods = ['find', 'findOne', 'findAndCount', 'count'];
  for (const method of emFindMethods) {
    const original = EntityManager.prototype[method];
    if (!original) continue;
    EntityManager.prototype[method] = function (target, options) {
      const metadata = metadataFor(this, target);
      return original.call(this, target, patchFindOptions(options, metadata));
    };
  }

  const emWhereMethods = ['findBy', 'findOneBy'];
  for (const method of emWhereMethods) {
    const original = EntityManager.prototype[method];
    if (!original) continue;
    EntityManager.prototype[method] = function (target, where) {
      const metadata = metadataFor(this, target);
      return original.call(this, target, patchWhere(where, metadata));
    };
  }

  const originalEmCreateQueryBuilder = EntityManager.prototype.createQueryBuilder;
  EntityManager.prototype.createQueryBuilder = function (target, alias, queryRunner) {
    const qb = originalEmCreateQueryBuilder.call(this, target, alias, queryRunner);
    // La firma admite `createQueryBuilder(queryRunner)` sin entidad: ahí no hay
    // nada que aislar porque no se sabe sobre qué tabla se va a consultar.
    if (!alias) return qb;
    const metadata = metadataFor(this, target);
    if (!metadata) return qb;
    return applyTenantScope(qb, metadata, alias);
  };
}
