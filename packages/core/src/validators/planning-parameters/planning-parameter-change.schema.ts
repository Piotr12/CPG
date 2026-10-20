import { z } from "zod";
import { positiveQuantitySchema, quantitySchema } from "../quantities/quantity.schema";
import { versionSchema } from "../version.schema";
import {
  leadTimeDaysSchema,
  leadTimeDaysTextSchema,
  locationReferenceSchema,
  materialReferenceSchema,
  procurementSchema,
} from "./planning-parameter-fields.schema";

/** What a body changing nothing is told; unknown keys are dropped, so a typo lands here too. */
export const NOTHING_TO_CHANGE_MESSAGE = "Send at least one of procurement, leadTimeDays, minimumQuantity or lotMultiple.";

const changes = z.object({
  version: versionSchema,
  procurement: procurementSchema.optional(),
  leadTimeDays: leadTimeDaysSchema.optional(),
  minimumQuantity: quantitySchema.optional(),
  lotMultiple: positiveQuantitySchema.optional(),
});

/**
 * `PATCH /api/tenants/{tenant}/planning-parameters/{material}/{location}`: at least one of the four
 * values, at the version the client loaded (API-029). The material and location come from the path.
 */
export const planningParameterChangeBodySchema = changes.superRefine((body, ctx) => {
  const { procurement, leadTimeDays, minimumQuantity, lotMultiple } = body;
  if ([procurement, leadTimeDays, minimumQuantity, lotMultiple].every((field) => field === undefined)) {
    ctx.addIssue({ code: "custom", path: ["changes"], message: NOTHING_TO_CHANGE_MESSAGE });
  }
});

export type PlanningParameterChangeBody = z.infer<typeof planningParameterChangeBodySchema>;

/** The Change form's own fields: all four values, prefilled, with the lead time as text. */
export const planningParameterChangeFormSchema = z.object({
  procurement: procurementSchema,
  leadTimeDays: leadTimeDaysTextSchema,
  minimumQuantity: quantitySchema,
  lotMultiple: positiveQuantitySchema,
});

/** The row the page binds to a change or a removal: the pair and the version it loaded. */
const row = z.object({ material: materialReferenceSchema, location: locationReferenceSchema, version: versionSchema });

/** The `changePlanningParameters` action: the form's values plus the bound row. */
export const planningParameterChangeSchema = planningParameterChangeFormSchema.extend(row.shape);

/** `DELETE …/planning-parameters/{material}/{location}`: the version the client loaded. */
export const planningParameterRemoveBodySchema = z.object({ version: versionSchema });

/** The `removePlanningParameters` action: the bound row. */
export const planningParameterRemoveSchema = row;
