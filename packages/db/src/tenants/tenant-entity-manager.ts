import {
  ReferenceKind,
  Utils,
  type ConnectionType,
  type Dictionary,
  type EntityData,
  type EntityKey,
  type EntityMetadata,
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
import { QueryBuilder, SqlEntityManager, type CountByOptions, type SqliteDriver } from "@mikro-orm/sqlite";
import { isTenantOwned, TenantViolationError } from "../entities/tenants/tenant-owned";

type Target = EntityName<object> | object | object[];

/** Fields `nativeUpdate` may set where tenant data is involved: plain values, never references. */
const PLAIN_FIELDS: readonly ReferenceKind[] = [ReferenceKind.SCALAR, ReferenceKind.EMBEDDED];

/** Whether writing this entity can touch tenant data: its own rows, or references to them. */
function touchesTenantData(meta: EntityMetadata | undefined): boolean {
  return isTenantOwned(meta) || Boolean(meta?.relations.some((prop) => isTenantOwned(prop.targetMeta)));
}

type FromTarget = Parameters<QueryBuilder<object>["from"]>[0];

/** The two QueryBuilder methods `guarded()` wraps. */
interface Rerootable {
  from(target: FromTarget, aliasName?: string): unknown;
  clone(...args: unknown[]): unknown;
}

/**
 * The ORM's EntityManager class (`entityManager` in the config; every fork keeps it). For every
 * entity that touches tenant data — tenant-owned ones, and global ones referencing them — it
 * refuses the paths that skip the flush guard or the tenant filter: `insert`, `insertMany`,
 * `upsert`, `upsertMany`, `clone`, `countBy` and the QueryBuilder (as its root, through `from()`,
 * also on clones), and a `nativeUpdate` that sets anything but plain fields, since a reference or
 * raw column could point a row at, or move it to, another tenant. Other global entities are
 * unaffected. ESLint bans the QueryBuilder in core and app outright; this is the runtime backstop.
 */
export class TenantEntityManager extends SqlEntityManager<SqliteDriver> {
  private refuseTenantOwned(target: Target, method: string): void {
    const sample: unknown = Array.isArray(target) ? target[0] : target;
    const entityName = (Utils.isEntity(sample) ? sample.constructor : sample) as EntityName<object>;
    const meta = this.getMetadata().find(entityName);
    if (touchesTenantData(meta)) {
      throw new TenantViolationError(`${method}() bypasses tenant checks; use em.create() and flush() for ${meta?.className}`);
    }
  }

  /** A `from()` target: an entity, or a raw table name (SQLite matches those case-insensitively). */
  private refuseTenantFrom(target: unknown): void {
    if (target instanceof QueryBuilder) return; // created (and checked) by createQueryBuilder
    const table = typeof target === "string" ? target.toLowerCase().split(".").pop() : undefined;
    const named = [...this.getMetadata().getAll().values()].find((meta) => meta.tableName.toLowerCase() === table);
    this.refuseTenantOwned((named?.class ?? target) as EntityName<object>, "QueryBuilder.from");
  }

  /** Re-checks every later `from()`, including on clones, which are built without this manager. */
  private guarded<Q extends object>(qb: Q): Q {
    const builder = qb as unknown as Rerootable;
    const from = builder.from.bind(builder);
    const clone = builder.clone.bind(builder) as (...args: unknown[]) => Q;
    return Object.assign(qb, {
      from: (target: FromTarget, aliasName?: string) => {
        this.refuseTenantFrom(target);
        return from(target, aliasName);
      },
      clone: (...args: unknown[]) => this.guarded(clone(...args)),
    });
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

  override async upsert<Entity extends object, Fields extends string = never>(
    entityNameOrEntity: EntityName<Entity> | Entity,
    data?: EntityData<Entity> | NoInfer<Entity>,
    options?: UpsertOptions<Entity, Fields>,
  ): Promise<Entity> {
    this.refuseTenantOwned(entityNameOrEntity, "upsert");
    return super.upsert(entityNameOrEntity, data, options);
  }

  override async upsertMany<Entity extends object, Fields extends string = never>(
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
    const meta = this.getMetadata().find(entityName);
    if (touchesTenantData(meta)) {
      const field = Object.keys(data).find((key) => !PLAIN_FIELDS.includes(meta?.properties[key as EntityKey<Entity>]?.kind as ReferenceKind));
      if (field !== undefined) {
        throw new TenantViolationError(
          `nativeUpdate() may only set plain fields of ${meta?.className}; '${field}' is a reference or not a field`,
        );
      }
    }
    return super.nativeUpdate(entityName, where, data, options);
  }

  /** It builds its query with `createQueryBuilder`; `count()` covers tenant-owned entities. */
  override async countBy<Entity extends object>(
    entityName: EntityName<Entity>,
    groupBy: EntityKey<Entity> | readonly EntityKey<Entity>[],
    options?: CountByOptions<Entity>,
  ): Promise<Dictionary<number>> {
    this.refuseTenantOwned(entityName, "countBy");
    return super.countBy(entityName, groupBy, options);
  }

  /** `qb()` delegates here. A QueryBuilder passed in was already created (and checked) here. */
  override createQueryBuilder<Entity extends object, RootAlias extends string = never>(
    entityName: EntityName<Entity> | QueryBuilder<Entity>,
    alias?: RootAlias,
    type?: ConnectionType,
    loggerContext?: LoggingOptions,
  ): QueryBuilder<Entity, RootAlias> {
    if (!(entityName instanceof QueryBuilder)) this.refuseTenantOwned(entityName, "createQueryBuilder");
    // `from()` replaces the root, so `createQueryBuilder(Setting).from(Material)` would escape the check.
    return this.guarded(super.createQueryBuilder(entityName, alias, type, loggerContext));
  }
}
