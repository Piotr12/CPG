import { mkdirSync } from "node:fs";
import path from "node:path";
import type { AppConfig } from "@cpg/core";
import { MikroORM, type Options } from "@mikro-orm/sqlite";
import { createOrmConfig } from "./config";

export type Orm = MikroORM;

/** Opens the SQLite database, creating its directory if needed. Does not migrate. */
export async function initOrm(config: AppConfig, overrides: Partial<Options> = {}): Promise<Orm> {
  mkdirSync(path.dirname(config.databasePath), { recursive: true });

  const orm = await MikroORM.init(createOrmConfig(config, overrides));
  // WAL lets readers work while a write is in progress; the setting persists in the file.
  await orm.em.getConnection().execute("pragma journal_mode = wal");

  return orm;
}

/** Applies pending migrations with a short-lived connection. Returns the applied migration names. */
export async function migrate(config: AppConfig): Promise<string[]> {
  const orm = await initOrm(config);
  try {
    return (await orm.migrator.up()).map((migration) => migration.name);
  } finally {
    await orm.close();
  }
}
