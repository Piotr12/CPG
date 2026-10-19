"use client";

import { usePathname } from "next/navigation";
import { TENANT_CODES, type TenantCode } from "@cpg/core/validators/tenants/tenant-code.schema";
import { TenantSwitchLinks, tenantHome, type TenantOption } from "./tenant-switch-links";

/**
 * Where switching to `target` leads from `pathname`: the same section in the other tenant, never a
 * deeper record page, because record IDs are tenant-local and the same ID is another record there
 * (TEN-012). From a page outside any tenant, the tenant's home.
 */
export function switchTenantPath(pathname: string, target: TenantCode): string {
  const [, root, tenant, section] = pathname.split("/");
  const inTenant = root === "admin" && (TENANT_CODES as readonly string[]).includes(tenant);
  return inTenant && section ? `${tenantHome(target)}/${section}` : tenantHome(target);
}

/** The switcher with section-preserving links (Q8 of the tenant spec). */
export function TenantSwitcher({ tenants, current }: { tenants: TenantOption[]; current?: TenantCode }) {
  const pathname = usePathname();
  return <TenantSwitchLinks tenants={tenants} current={current} hrefFor={(code) => switchTenantPath(pathname, code)} />;
}
