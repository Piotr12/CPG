import type { EntityManager } from "@cpg/db";

/**
 * Runs `fn` in one transaction on the request's own EntityManager and commits it (the commit
 * flushes first). Services resolved from the same scope hold this `em`, so their `flush()` runs
 * inside the transaction and their `em.transactional()` becomes a savepoint. `em.transactional()`
 * here would put the transaction on a child fork the services never see; their own transaction
 * would then wait forever for the single SQLite connection (spec Q6). On any error the transaction
 * is rolled back and the identity map cleared, so nothing from the failed attempt is flushed later.
 */
export async function inRequestTransaction<T>(em: EntityManager, fn: () => Promise<T>): Promise<T> {
  await em.begin();
  try {
    const result = await fn();
    await em.commit();
    return result;
  } catch (error) {
    await em.rollback();
    em.clear();
    throw error;
  }
}
