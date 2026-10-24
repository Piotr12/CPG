import { mkdirSync } from "node:fs";
import path from "node:path";
import { MikroORM, type EntityManager, type Options } from "@mikro-orm/sqlite";
import { createOrmConfig } from "./config";
import { cacheStatements } from "./statement-cache";

export type Orm = MikroORM;
export type { EntityManager };
/** Thrown on a duplicate in a unique column; services map it to their own conflict error. */
export { UniqueConstraintViolationException } from "@mikro-orm/sqlite";
/**
 * Thrown when SQLite reports "database is locked": another connection held the write lock past the
 * busy timeout, or this transaction's snapshot went stale before its first write.
 */
export { LockWaitTimeoutException } from "@mikro-orm/sqlite";
/** Thrown at flush when a versioned row changed since it was loaded; services map it to a 409. */
export { OptimisticLockError } from "@mikro-orm/sqlite";

/** What `@cpg/db` needs to know; `@cpg/core` derives it from the app config. */
export interface DbOptions {
  /** Absolute path of the SQLite database file. */
  databasePath: string;
  /** Log every SQL statement. */
  debug?: boolean;
}

/** Opens the SQLite database, creating its directory if needed. Does not migrate. */
export async function initOrm(options: DbOptions, overrides: Partial<Options> = {}): Promise<Orm> {
  mkdirSync(path.dirname(options.databasePath), { recursive: true });

  const orm = await MikroORM.init(createOrmConfig(options, overrides));
  // WAL lets readers work while a write is in progress; the setting persists in the file.
  await orm.em.getConnection().execute("pragma journal_mode = wal");
  cacheStatements(await orm.em.getConnection().getNativeClient());

  return orm;
}

/**
 * Proves the database connection is open, without queuing behind a transaction on it. Kysely
 * serialises the one SQLite connection with a mutex, which a transaction holds from `begin` to
 * `commit`, so an ordinary query issued during a realistic Test reset waits 40 s or more for it;
 * the `/up` health check must answer meanwhile (#185). `select 1` reads no table and leaves whatever
 * transaction is open on the connection as it was.
 */
export async function pingDatabase(orm: Orm): Promise<void> {
  const db = await orm.em.getConnection().getNativeClient();
  db.prepare("select 1").get();
}

/** Applies pending migrations with a short-lived connection. Returns the applied migration names. */
export async function migrate(options: DbOptions): Promise<string[]> {
  const orm = await initOrm(options);
  try {
    return (await orm.migrator.up()).map((migration) => migration.name);
  } finally {
    await orm.close();
  }
}

/** How many migrations have been applied to the database and how many are still pending. */
export async function getMigrationStatus(orm: Orm): Promise<{ applied: number; pending: number }> {
  // Sequential on purpose: on a never-migrated database both calls create the migrations table,
  // and run concurrently the second one fails with "table already exists".
  const executed = await orm.migrator.getExecuted();
  const pending = await orm.migrator.getPending();
  return { applied: executed.length, pending: pending.length };
}
