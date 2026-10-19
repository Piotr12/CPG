/*
 * Client-safe on purpose: the sidebar and the section trail import it, and `nav-items.ts` pulls in
 * `@cpg/core`. Only the `@cpg/core/validators/*` subpath, which never reaches the ORM, is allowed here.
 */
import { TENANT_CODES, type TenantCode } from "@cpg/core/validators/tenants/tenant-code.schema";

/** `exact`: only the screen itself (Overview, Tenants, which prefix others). `prefix`: the screen or a page under it. */
export type NavMatch = "exact" | "prefix";

/**
 * Whether `pathname` is the entry's screen: always the screen itself, and with `prefix` a page under
 * it too, so `/admin/test/materials/00000005` belongs to Materials.
 */
export function isCurrentPath(href: string, pathname: string, match: NavMatch): boolean {
  return pathname === href || (match === "prefix" && pathname.startsWith(`${href}/`));
}

/** The tenant a page belongs to (`/admin/{tenant}/…`), or null for a page outside any tenant. */
export function tenantFromPath(pathname: string): TenantCode | null {
  const [, root, segment] = pathname.split("/");
  return root === "admin" && (TENANT_CODES as readonly string[]).includes(segment) ? (segment as TenantCode) : null;
}
