import { z } from "zod";

/** How many material-location pairs one page of the latest run holds: 25 × 90 = 2,250 days (spec Q9). */
export const MRP_LATEST_PAGE_SIZE = 25;

/** A run ID: eight digits, as every sequential business ID (R01). */
export const MRP_RUN_ID_MESSAGE = "A run ID is eight digits.";

/** `generation` says which run `run` is: a Test reset restarts run IDs (D06). */
export const MRP_GENERATION_NEEDS_RUN_MESSAGE = "Send generation only with the run it belongs to.";

/**
 * `GET /api/tenants/{tenant}/mrp/runs/latest`: the page of pairs, and optionally the run the client
 * paged from with its dataset generation, so a newer run is a refusal rather than a page of other
 * results. Another parameter is refused.
 */
export const mrpLatestQuerySchema = z
  .strictObject({
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    run: z.string().regex(/^\d{8}$/, MRP_RUN_ID_MESSAGE).optional(),
    generation: z.coerce.number().int().min(1).optional(),
  })
  .refine((query) => query.generation === undefined || query.run !== undefined, { path: ["generation"], message: MRP_GENERATION_NEEDS_RUN_MESSAGE });

export type MrpLatestQuery = z.output<typeof mrpLatestQuerySchema>;
