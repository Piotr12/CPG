import { revalidatePath } from "next/cache";
import type { Result } from "@cpg/core";

/** A form's values as an object to add the bound fields to; anything else counts as no values. */
export function formValues(values: unknown): object {
  return typeof values === "object" && values !== null ? values : {};
}

/**
 * Refreshes `paths` after a write that succeeded or met a stale version (so the page shows what
 * changed and a retry carries the new version), and passes the result on. Only then: a failed write
 * may carry a tenant or ID that names no page. A read-only refusal (`TENANT_READ_ONLY`) must not
 * refresh either: the refreshed page hides its write controls, which would drop the dialog that
 * explains the refusal.
 */
export function refreshAfterWrite<T>(result: Result<T>, ...paths: string[]): Result<T> {
  return refreshAfterWriteOr(result, [], ...paths);
}

/**
 * `refreshAfterWrite`, refreshing after the refusals in `codes` too: those whose dialog row survives the
 * refresh and reads better for it. An already accepted MRP proposal (`MRP_PROPOSAL_ACCEPTED`) then
 * shows the document another session created, while a stale one keeps its "Run MRP again" advice.
 */
export function refreshAfterWriteOr<T>(result: Result<T>, codes: readonly string[], ...paths: string[]): Result<T> {
  if (result.ok || result.error.code === "VERSION_CONFLICT" || codes.includes(result.error.code)) {
    for (const path of paths) revalidatePath(path);
  }
  return result;
}
