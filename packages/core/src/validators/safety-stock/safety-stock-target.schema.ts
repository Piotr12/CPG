import { z } from "zod";
import { calendarDateSchema } from "../dates/calendar-date.schema";
import { locationReferenceSchema, materialReferenceSchema } from "../planning-parameters/planning-parameter-fields.schema";
import { quantitySchema } from "../quantities/quantity.schema";
import { versionSchema } from "../version.schema";

/**
 * A new safety-stock target (DEM-015): the Add target form, its action and
 * `POST /api/tenants/{tenant}/safety-stock-targets` share it. The quantity is a base-unit decimal
 * string of at least 0; the date is ISO `YYYY-MM-DD`, past or future (spec Q8).
 */
export const safetyStockTargetCreateSchema = z.object({
  material: materialReferenceSchema,
  location: locationReferenceSchema,
  effectiveFrom: calendarDateSchema,
  quantity: quantitySchema,
});

export type SafetyStockTargetCreateInput = z.infer<typeof safetyStockTargetCreateSchema>;

/** `PATCH …/safety-stock-targets/{material}/{location}/{effectiveFrom}`: a new quantity at a version. */
export const safetyStockTargetChangeBodySchema = z.object({ quantity: quantitySchema, version: versionSchema });

/** The Change target form's own field. */
export const safetyStockTargetChangeFormSchema = safetyStockTargetChangeBodySchema.omit({ version: true });

/** `DELETE …/safety-stock-targets/{material}/{location}/{effectiveFrom}`: the version the client loaded. */
export const safetyStockTargetRemoveBodySchema = z.object({ version: versionSchema });

/** The target the page binds to a change or a removal: its key and the version it loaded. */
const row = z.object({
  material: materialReferenceSchema,
  location: locationReferenceSchema,
  effectiveFrom: calendarDateSchema,
  version: versionSchema,
});

/** The `changeSafetyStockTarget` action: the form's quantity plus the bound row. */
export const safetyStockTargetChangeSchema = safetyStockTargetChangeFormSchema.extend(row.shape);

/** The `removeSafetyStockTarget` action: the bound row. */
export const safetyStockTargetRemoveSchema = row;
