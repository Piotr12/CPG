import {
  ChangeSetType,
  ReferenceKind,
  helper,
  type ChangeSet,
  type EntityManager,
  type EventSubscriber,
  type FlushEventArgs,
} from "@mikro-orm/core";
import {
  TenantViolationError,
  currentTenant,
  isTenantOwned,
} from "../entities/tenants/tenant-owned";
import type { TenantCode } from "../entities/tenants/tenant.entity";

const TO_ONE: readonly ReferenceKind[] = [ReferenceKind.MANY_TO_ONE, ReferenceKind.ONE_TO_ONE];

/** The tenant code of a tenant-owned entity, or undefined when its `tenant` wasn't loaded. */
function tenantOf(entity: object): TenantCode | undefined {
  const tenant = (entity as { tenant?: object | null }).tenant;
  return tenant ? (helper(tenant).getPrimaryKey() as TenantCode) : undefined;
}

/**
 * Checks that a tenant-owned entity another one points at is in the scope's tenant. Only an entity
 * loaded through the scope can prove that: a hand-built reference (`getReference`) is refused, which
 * is also what makes a Prod ID used in Test fail instead of linking across tenants (TEN-014).
 */
function assertSameTenant(target: object, code: TenantCode, where: string): void {
  if (!helper(target).isInitialized()) {
    throw new TenantViolationError(`${where} points at a record that wasn't loaded through the tenant scope`);
  }
  if (tenantOf(target) !== code) throw new TenantViolationError(`${where} points at a record of another tenant`);
}

/** A changed entity's own tenant: it must be the scope's, loaded, and never changed. */
function checkOwnership(changeSet: ChangeSet<object>, code: TenantCode): void {
  const { entity, meta, payload, type } = changeSet;
  const name = meta.className;
  if (type !== ChangeSetType.CREATE && !helper(entity).isInitialized()) {
    throw new TenantViolationError(`${name} was changed through an unloaded reference`);
  }
  if (type === ChangeSetType.UPDATE && "tenant" in payload) {
    throw new TenantViolationError(`${name}.tenant can't change`);
  }
  if (tenantOf(entity) !== code) throw new TenantViolationError(`${name} belongs to another tenant, or its tenant isn't loaded`);
}

/** The tenant-owned records a change points at through to-one references it sets. */
function referencedRecords({ entity, meta, payload }: ChangeSet<object>): { target: object; where: string }[] {
  return meta.relations.flatMap((prop) => {
    if (!TO_ONE.includes(prop.kind) || prop.name === "tenant" || !(prop.name in payload)) return [];
    const target = (entity as Record<string, object | null | undefined>)[prop.name];
    return target && isTenantOwned(prop.targetMeta) ? [{ target, where: `${meta.className}.${prop.name}` }] : [];
  });
}

/**
 * Rejects a flush (before any SQL runs) that would write tenant-owned data outside the scope's
 * tenant: no tenant selected, an entity or reference of another tenant, a changed `tenant`, or a
 * reference whose tenant can't be checked. References from global records to tenant-owned ones
 * (to-one or collections) are checked the same way. Flushes that touch no tenant-owned data pass.
 */
export class TenantGuard implements EventSubscriber {
  onFlush({ em, uow }: FlushEventArgs): void {
    const changeSets = uow.getChangeSets();
    const owned = changeSets.filter(({ meta }) => isTenantOwned(meta));
    const references = changeSets.flatMap(referencedRecords);
    const collections = uow
      .getCollectionUpdates()
      .filter((collection) => isTenantOwned(helper(collection.owner).__meta) || isTenantOwned(collection.property.targetMeta));
    if (owned.length === 0 && references.length === 0 && collections.length === 0) return;

    const code = currentTenant(em as EntityManager);
    if (!code) throw new TenantViolationError("writing tenant-owned data without a tenant scope");

    for (const changeSet of owned) checkOwnership(changeSet, code);
    for (const { target, where } of references) assertSameTenant(target, code, where);
    for (const collection of collections) {
      const where = `${helper(collection.owner).__meta.className}.${collection.property.name}`;
      if (isTenantOwned(helper(collection.owner).__meta)) assertSameTenant(collection.owner, code, where);
      if (!isTenantOwned(collection.property.targetMeta)) continue;
      for (const item of collection.getItems(false)) assertSameTenant(item, code, where);
    }
  }
}
