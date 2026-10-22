"use server";

import { revalidatePath } from "next/cache";
import {
  assertAdmin,
  requestScope,
  retryingStaleSnapshot,
  serverAction,
  tenantScope,
  uiActor,
  type Result,
  type TenantInfo,
} from "@cpg/core";
import { tenantReadOnlySchema } from "@cpg/core/validators/tenants/tenant-read-only.schema";
import { testResetSchema } from "@cpg/core/validators/tenants/test-reset.schema";
import { currentUser } from "../../../auth/require-admin";

/**
 * Makes a tenant read-only or writable again, from the Read-only card (R05). Admin only, checked
 * inside the wrapper after parsing; the session is read first, outside the write. A write that
 * committed on another connection after this one read the tenant makes SQLite refuse it as a stale
 * snapshot: it runs once more, as tenant writes do. On success Cave control refreshes. Tenant pages
 * read the flag at request time, so they need no revalidation: revalidating the whole `/admin`
 * layout made Next.js re-prerender their static shells at runtime, which fails and hangs them.
 */
export async function setTenantReadOnly(values: unknown): Promise<Result<TenantInfo>> {
  const { tenantService } = (await requestScope()).cradle;
  const actor = await currentUser();
  const result = await serverAction(tenantReadOnlySchema, ({ tenant, readOnly }) =>
    retryingStaleSnapshot(() => tenantService.setReadOnly(tenant, readOnly, uiActor(assertAdmin(actor)))),
  )(values);
  if (result.ok) revalidatePath("/admin");
  return result;
}


/** Test reset is a global admin control; its service owns the atomic write even when Test is read-only. */
export async function resetTest(values: unknown): Promise<Result<TenantInfo>> {
  const user = await currentUser();
  const result = await serverAction(testResetSchema, async ({ generation, dataset }) => {
    const actor = uiActor(assertAdmin(user));
    return (await tenantScope("test")).cradle.testResetService.reset(generation, actor, dataset);
  })(values);
  // The control survives this refresh and keeps its confirmed generation/error until closed.
  if (result.ok || result.error.code === "GENERATION_STALE") revalidatePath("/admin");
  return result;
}
