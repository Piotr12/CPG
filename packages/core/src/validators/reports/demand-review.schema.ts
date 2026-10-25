import { z } from "zod";
import { DEMAND_BUCKETS, MAX_DEMAND_OFFSET } from "../../domain/demand/demand-buckets";
import { locationReferenceSchema, materialReferenceSchema } from "../planning-parameters/planning-parameter-fields.schema";

/** How many products, or locations, one read may name: far above a tenant's finished products, and a bound on the `$in` lists. */
export const DEMAND_SELECTION_MAX = 500;

/** The English messages; screens translate them by matching these constants. */
export const DEMAND_SELECTION_MESSAGE = "Choose at most 500.";
export const DEMAND_OFFSET_MESSAGE = "Earlier and Later move at most 20 windows from today.";
export const FINISHED_PRODUCTS_ONLY_MESSAGE = "Choose finished products only.";

/**
 * A repeatable reference parameter: absent, one value or several, as `URLSearchParams.getAll` and a
 * `<select multiple>` send them. The form's empty values are dropped and a repeated ID counts once.
 */
const references = (reference: z.ZodType<string>) =>
  z.preprocess(
    (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]).filter((item) => item !== ""),
    z.array(reference).max(DEMAND_SELECTION_MAX, DEMAND_SELECTION_MESSAGE).transform((ids) => [...new Set(ids)]),
  );

/**
 * `GET /api/tenants/{tenant}/reports/demand-review` and the Demand review page (#240): the time
 * bucket, finished products and locations (none means all), the report unit and the window's offset
 * from today. Another parameter is refused, so a misspelt filter never silently shows everything. A
 * unit the selection doesn't allow is not refused: the report says which unit it used.
 */
export const demandReviewQuerySchema = z.strictObject({
  bucket: z.enum(DEMAND_BUCKETS).default("week"),
  material: references(materialReferenceSchema),
  location: references(locationReferenceSchema),
  unit: z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().trim().optional()),
  offset: z.coerce.number().int(DEMAND_OFFSET_MESSAGE).min(-MAX_DEMAND_OFFSET, DEMAND_OFFSET_MESSAGE).max(MAX_DEMAND_OFFSET, DEMAND_OFFSET_MESSAGE).default(0),
});

export type DemandReviewQuery = z.output<typeof demandReviewQuerySchema>;
