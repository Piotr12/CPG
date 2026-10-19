import { z } from "zod";
import { tenantCodeSchema } from "./tenant-code.schema";

/** `PATCH /api/tenants/{tenant}`: the flag to set (the tenant comes from the path). Nothing else. */
export const tenantReadOnlyBodySchema = z.strictObject({ readOnly: z.boolean() });

/** The `/admin` Read-only card's action: which tenant, and the flag to set. */
export const tenantReadOnlySchema = z.strictObject({ tenant: tenantCodeSchema, readOnly: z.boolean() });

export type TenantReadOnlyInput = z.infer<typeof tenantReadOnlySchema>;
