import { mkdirSync } from "node:fs";
import path from "node:path";
import { MikroORM, type EntityManager, type Options } from "@mikro-orm/sqlite";
import { createOrmConfig } from "./config";

export type Orm = MikroORM;
export type { EntityManager };

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

  return orm;
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
  const [executed, pending] = await Promise.all([orm.migrator.getExecuted(), orm.migrator.getPending()]);
  return { applied: executed.length, pending: pending.length };
}
