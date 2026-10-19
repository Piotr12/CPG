import { ApiToken, initOrm, migrate, Session, Setting, User, type DbOptions } from "@cpg/db";
import type { AppConfig } from "./config";
import { ADMIN_PASSWORD_SETTING, verifiedAdminPasswordStamp } from "./services/auth/admin-password-stamp";
import { hashPassword } from "./services/auth/password-hash";

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

/**
 * Deletes the built-in admin's API tokens when `CPG_ADMIN_PASSWORD` changed since the last start:
 * for the admin, that change is the password reset that must end every credential (R06). An
 * ordinary restart keeps them, because tokens never expire (API-009). The change is detected
 * against the argon2id stamp in `setting`; a missing stamp counts as a change (fail closed). The
 * deletion and the new stamp commit together. Run at every server start, with a short-lived
 * connection. Returns how many tokens ended.
 */
export async function revokeAdminTokensIfPasswordChanged(config: AppConfig): Promise<number> {
  const { adminPassword } = config;
  // assertServerConfig has already refused to start without one; there is nothing to compare.
  if (!adminPassword) return 0;
  const orm = await initOrm(toDbOptions(config));
  try {
    const em = orm.em.fork();
    if (await verifiedAdminPasswordStamp(em, adminPassword)) return 0;
    // Hash before the transaction: SQLite has one writer, so keep the write lock short.
    const stamp = await hashPassword(adminPassword);
    return await em.transactional(async (tx) => {
      const admins = await tx.find(User, { role: "admin" }, { fields: ["id"] });
      const revoked = await tx.nativeDelete(ApiToken, { user: { $in: admins.map(({ id }) => id) } });
      const setting = await tx.findOne(Setting, { key: ADMIN_PASSWORD_SETTING });
      if (setting) setting.value = stamp;
      else tx.create(Setting, { key: ADMIN_PASSWORD_SETTING, value: stamp });
      return revoked;
    });
  } finally {
    await orm.close();
  }
}
