import type { TenantCode } from "@cpg/core/validators/tenants/tenant-code.schema";
import { badgeVariants } from "@cpg/ui/components/badge";
import { cn } from "@cpg/ui/lib/utils";

/** What a page works on: one tenant, or none (`global`: accounts, settings, the tenant cards). */
export type TenantScope = TenantCode | "global";

/**
 * The tenant's colours, in one place (spec "Tokens and colour": the tenant is shown only by tenant
 * tokens). Complete class strings, because Tailwind only generates classes it finds whole. Prod's
 * dark-theme inversion lives in the tokens; Global is a quiet grey, not a tenant.
 */
export const TENANT_TAG_COLOURS: Record<TenantScope, string> = {
  test: "bg-tenant-test-tag text-tenant-test-tag-foreground",
  prod: "bg-tenant-prod-tag text-tenant-prod-tag-foreground",
  global: "bg-muted text-muted-foreground",
};

/** The tenant's edge colour, for a border on any side the caller chooses. */
export const TENANT_EDGES: Record<TenantCode, string> = {
  test: "border-tenant-test-edge",
  prod: "border-tenant-prod-edge",
};

/** The word every tenant surface carries (TEN-011): never colour alone. Language-neutral. */
export const TENANT_WORDS: Record<TenantScope, string> = { test: "TEST", prod: "PROD", global: "GLOBAL" };

/**
 * The TEST / PROD / GLOBAL tag. It shares the `Badge` geometry (20 px, `rounded-sm`, `text-xs`), set
 * in capitals, spaced and semibold.
 */
export function TenantTag({ tenant, id }: { tenant: TenantScope; id?: string }) {
  return (
    <span
      id={id}
      data-tenant-tag={tenant}
      className={cn(badgeVariants({ variant: null }), "font-semibold tracking-widest uppercase", TENANT_TAG_COLOURS[tenant])}
    >
      {TENANT_WORDS[tenant]}
    </span>
  );
}
