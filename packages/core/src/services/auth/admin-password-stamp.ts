import { Setting, type EntityManager } from "@cpg/db";
import { verifyPassword } from "./password-hash";

/**
 * The `setting` key holding the argon2id hash of the admin password the server last started with.
 * It tells a restart with a new `CPG_ADMIN_PASSWORD` (a reset of the admin: its API tokens must
 * end, R06) from an ordinary restart (they must not: tokens never expire, API-009).
 */
export const ADMIN_PASSWORD_SETTING = "auth.admin-password";

/**
 * The stored stamp when `adminPassword` matches it, otherwise null (also when there is no stamp or
 * no password: fail closed). Returning the stamp lets a caller check, inside its own transaction,
 * that it hasn't changed since.
 */
export async function verifiedAdminPasswordStamp(
  em: EntityManager,
  adminPassword: string | undefined,
): Promise<string | null> {
  if (!adminPassword) return null;
  const stamp = await em.findOne(Setting, { key: ADMIN_PASSWORD_SETTING });
  if (!stamp) return null;
  return (await verifyPassword(adminPassword, stamp.value)) ? stamp.value : null;
}
