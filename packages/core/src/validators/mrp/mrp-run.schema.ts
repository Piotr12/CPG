import { z } from "zod";

/**
 * The body of `POST /api/tenants/{tenant}/mrp/runs` and the Run MRP action: empty or `{}`. A run takes
 * no input yet, and any key is refused, so the run mode E19-S03 adds stays an additive change.
 */
export const mrpRunSchema = z.strictObject({}).nullable();
