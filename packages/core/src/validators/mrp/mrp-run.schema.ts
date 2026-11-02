import { z } from "zod";

/**
 * How a run's proposals become documents (E19-S03). Re-declared here, equal to `@cpg/db`'s `MRP_RUN_MODES`
 * (pinned by the test), because validators stay free of the ORM: a client component may import them.
 */
export const MRP_RUN_INPUT_MODES = ["manual", "automatic"] as const;

/**
 * The body of `POST /api/tenants/{tenant}/mrp/runs` and the Run MRP action: empty, `{}`, or `{ mode }`, where
 * `mode` is `manual` (the default) or `automatic` (E19-S03). Any other key is refused, so a later option stays
 * an additive change.
 */
export const mrpRunSchema = z.strictObject({ mode: z.enum(MRP_RUN_INPUT_MODES).optional() }).nullable();

export type MrpRunInput = z.infer<typeof mrpRunSchema>;
