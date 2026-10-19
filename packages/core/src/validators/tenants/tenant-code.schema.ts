import { z } from "zod";

/**
 * The two tenants, as they appear in URLs and data. Re-declared here (equal to `@cpg/db`'s, which a
 * test asserts) so client code importing this subpath never pulls the ORM into the browser bundle.
 */
export const TENANT_CODES = ["test", "prod"] as const;
export type TenantCode = (typeof TENANT_CODES)[number];

/** A tenant segment from a URL or a bound action argument. Case-sensitive: `TEST` is not a tenant. */
export const tenantCodeSchema = z.enum(TENANT_CODES);
