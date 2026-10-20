import { LockWaitTimeoutException, type EntityManager } from "@cpg/db";

/**
 * Runs `fn` in one transaction on the request's own EntityManager and commits it (the commit
 * flushes first). Services resolved from the same scope hold this `em`, so their `flush()` runs
 * inside the transaction and their `em.transactional()` becomes a savepoint. `em.transactional()`
 * here would put the transaction on a child fork the services never see; their own transaction
 * would then wait forever for the single SQLite connection (spec Q6). On any error the transaction
 * is rolled back and the identity map cleared, so nothing from the failed attempt is flushed later.
 * The caller always sees the original error: a rollback that fails too (SQLite may already have
 * rolled back on its own) is logged, as MikroORM's own `transactional()` does.
 */
export async function inRequestTransaction<T>(em: EntityManager, fn: () => Promise<T>): Promise<T> {
  await em.begin();
  try {
    const result = await fn();
    await em.commit();
    return result;
  } catch (error) {
    try {
      await em.rollback();
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError);
    } finally {
      em.clear();
    }
    throw error;
  }
}

/**
 * Runs `fn` in a savepoint of the request's transaction, opened on the request's own `em`, then keeps
 * it (`keep: true`) or rolls back to it (`keep: false`); a throw from `fn` always rolls back to it and
 * propagates. The import's apply pass runs in one (spec `2026-10-20--0908UTC-master-data-bom-import`,
 * Q6). Opening it on `em` itself is what makes it hold: services' own `em.transactional()` then nests
 * its savepoints under this one, and rolling back to this one undoes them all. (`em.transactional()`
 * here would open the savepoint on a fork the services never see: their savepoints would take the same
 * name, and a rollback would land on the wrong one.) Afterwards the request transaction is `em`'s
 * again, so the caller's commit and the idempotency key's store still run in it, and the identity map
 * is cleared, so nothing rolled back can be flushed later. Call it only inside `inRequestTransaction`.
 */
export async function inRequestSavepoint<T>(em: EntityManager, fn: () => Promise<T>, { keep }: { keep: boolean }): Promise<T> {
  const parent = em.getTransactionContext();
  if (!parent) throw new Error("inRequestSavepoint must run inside the request transaction.");
  await em.begin({ ctx: parent });
  try {
    const result = await fn();
    if (keep) await em.commit();
    else await em.rollback();
    return result;
  } catch (error) {
    try {
      await em.rollback();
    } catch (rollbackError) {
      console.error("Savepoint rollback failed:", rollbackError);
    }
    throw error;
  } finally {
    em.setTransactionContext(parent);
    em.clear();
  }
}

/**
 * SQLite refused this transaction's first write because another connection committed after its first
 * read (`SQLITE_BUSY_SNAPSHOT`). It fails at once, without waiting, and a new transaction succeeds.
 */
export function isStaleSnapshot(error: unknown): boolean {
  return error instanceof LockWaitTimeoutException && error.code === "SQLITE_BUSY_SNAPSHOT";
}

/**
 * Runs a whole transaction (`attempt` opens and commits it) and runs it once more when SQLite
 * refused it as a stale snapshot: two writes that each read before writing, such as two creates
 * picking the next material ID, then both succeed, the second with what the first committed. A
 * real lock timeout already waited `busy_timeout` and is not retried; neither is a second refusal.
 */
export async function retryingStaleSnapshot<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (isStaleSnapshot(error)) return attempt();
    throw error;
  }
}
