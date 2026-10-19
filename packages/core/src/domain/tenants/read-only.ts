import { ConflictError } from "../../http/errors";

/** What a refused write says. It names no tenant: screens show one translation per code. */
export const TENANT_READ_ONLY =
  "This tenant is read-only, so its business data can't be changed. The administrator can make it writable on the Cave control page (/admin).";

/**
 * Refuses a business write to a read-only tenant (R05, TEN-015…017, API-030), whoever makes it: the
 * flag is not a permission, so the admin's and the API's writes are refused too. `state` must be
 * read fresh inside the write's transaction, so a flag set meanwhile can't be missed.
 */
export function assertWritable(state: { readOnly: boolean }): void {
  if (state.readOnly) throw new ConflictError(TENANT_READ_ONLY, "TENANT_READ_ONLY");
}
