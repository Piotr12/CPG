import {
  Utils,
  type ConnectionType,
  type EntityData,
  type EntityName,
  type FilterQuery,
  type LoggingOptions,
  type NativeInsertUpdateOptions,
  type Primary,
  type RequiredEntityData,
  type UpdateOptions,
  type UpsertManyOptions,
  type UpsertOptions,
} from "@mikro-orm/core";
import { QueryBuilder, SqlEntityManager, type SqliteDriver } from "@mikro-orm/sqlite";
import { isTenantOwned, TenantViolationError } from "../entities/tenants/tenant-owned";

type Target = EntityName<object> | object | object[];

/**
 * The ORM's EntityManager class (`entityManager` in the config; every fork keeps it). It refuses
 * the write paths that skip both the flush guard and the tenant filter — `insert`, `insertMany`,
 * `upsert`, `upsertMany`, `clone` and the QueryBuilder — for tenant-owned entities, and a
 * `nativeUpdate` that would move rows to another tenant. Global entities are unaffected.
 */
export class TenantEntityManager extends SqlEntityManager<SqliteDriver> {
  private refuseTenantOwned(target: Target, method: string): void {
    const sample: unknown = Array.isArray(target) ? target[0] : target;
    const entityName = (Utils.isEntity(sample) ? sample.constructor : sample) as EntityName<object>;
    const meta = this.getMetadata().find(entityName);
    if (isTenantOwned(meta)) {
      throw new TenantViolationError(`${method}() bypasses tenant checks; use em.create() and flush() for ${meta?.className}`);
    }
  }

  override async insert<Entity extends object>(
    entityNameOrEntity: EntityName<Entity> | Entity,
    data?: NoInfer<RequiredEntityData<Entity> | Entity>,
    options?: NativeInsertUpdateOptions<Entity>,
  ): Promise<Primary<Entity>> {
    this.refuseTenantOwned(entityNameOrEntity, "insert");
    return super.insert(entityNameOrEntity, data, options);
  }

  override async insertMany<Entity extends object>(
    entityNameOrEntities: EntityName<Entity> | Entity[],
    data?: NoInfer<RequiredEntityData<Entity>[] | Entity[]>,
    options?: NativeInsertUpdateOptions<Entity>,
  ): Promise<Primary<Entity>[]> {
    this.refuseTenantOwned(entityNameOrEntities, "insertMany");
    return super.insertMany(entityNameOrEntities, data, options);
  }

  override async upsert<Entity extends object, Fields extends string = any>(
    entityNameOrEntity: EntityName<Entity> | Entity,
    data?: EntityData<Entity> | NoInfer<Entity>,
    options?: UpsertOptions<Entity, Fields>,
  ): Promise<Entity> {
    this.refuseTenantOwned(entityNameOrEntity, "upsert");
    return super.upsert(entityNameOrEntity, data, options);
  }

  override async upsertMany<Entity extends object, Fields extends string = any>(
    entityNameOrEntity: EntityName<Entity> | Entity[],
    data?: (EntityData<Entity> | NoInfer<Entity>)[],
    options?: UpsertManyOptions<Entity, Fields>,
  ): Promise<Entity[]> {
    this.refuseTenantOwned(entityNameOrEntity, "upsertMany");
    return super.upsertMany(entityNameOrEntity, data, options);
  }

  override async clone<Entity extends object>(
    entityNameOrEntity: EntityName<Entity> | Entity,
    whereOrOverrides?: FilterQuery<NoInfer<Entity>> | EntityData<Entity>,
    overridesOrOptions?: EntityData<Entity> | NativeInsertUpdateOptions<Entity>,
    options?: NativeInsertUpdateOptions<Entity>,
  ): Promise<Entity> {
    this.refuseTenantOwned(entityNameOrEntity, "clone");
    return super.clone(entityNameOrEntity, whereOrOverrides, overridesOrOptions, options);
  }

  override async nativeUpdate<Entity extends object>(
    entityName: EntityName<Entity>,
    where: FilterQuery<NoInfer<Entity>>,
    data: EntityData<Entity>,
    options?: UpdateOptions<Entity>,
  ): Promise<number> {
    if ("tenant" in data) this.refuseTenantOwned(entityName, "nativeUpdate");
    return super.nativeUpdate(entityName, where, data, options);
  }

  /** `qb()` delegates here. A QueryBuilder passed in was already created (and checked) here. */
  override createQueryBuilder<Entity extends object, RootAlias extends string = never>(
    entityName: EntityName<Entity> | QueryBuilder<Entity>,
    alias?: RootAlias,
    type?: ConnectionType,
    loggerContext?: LoggingOptions,
  ): QueryBuilder<Entity, RootAlias> {
    if (!(entityName instanceof QueryBuilder)) this.refuseTenantOwned(entityName, "createQueryBuilder");
    return super.createQueryBuilder(entityName, alias, type, loggerContext);
  }
}
