import { initOrm, migrate, Session, User, type DbOptions } from "@cpg/db";
import type { AppConfig } from "./config";

/** The part of the app config `@cpg/db` needs. */
export function toDbOptions(config: AppConfig): DbOptions {
  return { databasePath: config.databasePath, debug: config.debugSql };
}

/** Applies pending migrations with a short-lived connection. Returns the applied migration names. */
export function migrateDatabase(config: AppConfig): Promise<string[]> {
  return migrate(toDbOptions(config));
}

/**
 * Signs the built-in admin out everywhere, with a short-lived connection like the startup
 * migrations (never the shared container). Run at every server start: the admin password can only
 * change with a restart, so sessions opened with the old one end then. Returns how many ended.
 */
export async function revokeBuiltInAdminSessions(config: AppConfig): Promise<number> {
  const orm = await initOrm(toDbOptions(config));
  try {
    const em = orm.em.fork();
    const admins = await em.find(User, { role: "admin" }, { fields: ["id"] });
    return await em.nativeDelete(Session, { user: { $in: admins.map(({ id }) => id) } });
  } finally {
    await orm.close();
  }
}
