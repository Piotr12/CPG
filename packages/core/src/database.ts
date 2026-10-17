import { migrate, type DbOptions } from "@cpg/db";
import type { AppConfig } from "./config";

/** The part of the app config `@cpg/db` needs. */
export function toDbOptions(config: AppConfig): DbOptions {
  return { databasePath: config.databasePath, debug: config.debugSql };
}

/** Applies pending migrations with a short-lived connection. Returns the applied migration names. */
export function migrateDatabase(config: AppConfig): Promise<string[]> {
  return migrate(toDbOptions(config));
}
