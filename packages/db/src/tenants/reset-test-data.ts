import type { EntityManager } from "../orm";
import { currentTenant, isTenantOwned, TenantViolationError } from "../entities/tenants/tenant-owned";

/** The complete reset footprint, derived from registration rather than a per-concept table list. */
export function testResetEntities(em: EntityManager) {
  const metadata = [...em.getMetadata().getAll().values()];
  const owned = metadata.filter(isTenantOwned);
  // A cascade or SET NULL from a business record must never alter a global record during reset.
  if (metadata.some((meta) => !isTenantOwned(meta) && meta.relations.some((relation) => isTenantOwned(relation.targetMeta)))) {
    throw new TenantViolationError("a global entity references tenant-owned data; reset cannot preserve it");
  }
  return owned;
}

/**
 * Clears Test only, inside the caller's transaction. FK checks are deferred to its commit, never
 * disabled: even cyclic tenant references can be removed together, while invalid survivors abort
 * the transaction. Native deletes retain the default tenant filter. No schema is changed here.
 */
export async function resetTestData(em: EntityManager): Promise<void> {
  if (currentTenant(em) !== "test" || !em.isInTransaction()) {
    throw new TenantViolationError("reset requires a Test scope and an active transaction");
  }
  const owned = testResetEntities(em);
  await em.getConnection().execute("pragma defer_foreign_keys = on", [], "run", em.getTransactionContext());
  for (const meta of owned) await em.nativeDelete(meta.class, {});
  em.clear();
}
